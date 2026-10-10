"""Unit tests for MFA flow orchestration."""

from datetime import UTC, datetime, timedelta
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Response, status
from fastapi_users.exceptions import UserNotExists
from fastapi_users.router.common import ErrorCode
from pydantic import SecretStr

from app.api.auth.exceptions import (
    MfaChallengeInvalidError,
    MfaCodeInvalidError,
    MfaStepUpCodeInvalidError,
    RecentSignInRequiredError,
)
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaRecoveryCodesRegenerateRequest,
    MfaTotpConfirmRequest,
    MfaTotpDisableRequest,
    UserUpdate,
)
from app.api.auth.services import mfa_flow, mfa_service, rate_limiter
from app.api.auth.services.account_security import RECENT_SIGN_IN_WINDOW
from app.api.common.audit import AuditAction, AuditContext


def build_mfa_user(**flags: object) -> tuple[MagicMock, MagicMock]:
    """Build the (user, user_manager) pair every MFA flow test stubs."""
    user = MagicMock()
    user.id = "user-id"
    for name, value in flags.items():
        setattr(user, name, value)
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)
    return user, user_manager


async def test_get_mfa_token_applies_fingerprint_rate_limit() -> None:
    """Raw MFA tokens should be extracted through the shared token rate limiter."""
    with patch(
        "app.api.auth.services.mfa_flow.mfa_service.enforce_mfa_token_rate_limit", new_callable=AsyncMock
    ) as enforce:
        token = await mfa_flow.get_mfa_token(SecretStr("token-value"))

    assert token == "token-value"
    enforce.assert_awaited_once_with("token-value")


async def test_claim_oauth_mfa_handoff_consumes_handoff_token() -> None:
    """OAuth handoff claims should expose only the pending MFA token."""
    with patch(
        "app.api.auth.services.mfa_flow.mfa_service.consume_oauth_handoff",
        new=AsyncMock(return_value="mfa-token"),
    ) as consume:
        result = await mfa_flow.claim_oauth_mfa_handoff(
            MfaOAuthClaimRequest(mfa_handoff=SecretStr("handoff-token")),
            redis=MagicMock(),
        )

    assert result.mfa_token == "mfa-token"
    consume.assert_awaited_once()


async def test_complete_mfa_challenge_invalid_code_does_not_consume_login_challenge() -> None:
    """Invalid TOTP codes should keep the login challenge available for retry."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret")

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=False)),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge", new=AsyncMock()) as consume,
        patch("app.api.auth.services.mfa_flow.account_guess_budget", wraps=rate_limiter.account_guess_budget) as budget,
        patch("app.api.auth.services.mfa_flow.audit_mfa_failure") as audit_failure,
        pytest.raises(MfaCodeInvalidError),
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="000000"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    consume.assert_not_awaited()
    # The guess is charged to the account, not only to this challenge token.
    budget.assert_called_once_with("user-id")
    audit_failure.assert_called_once_with(user, reason="invalid_mfa_code")


def test_audit_mfa_failure_emits_denied_event() -> None:
    """A failed MFA check is logged against the user with the reason it was denied."""
    user, _ = build_mfa_user()

    with patch("app.api.auth.services.mfa_flow.audit_event") as audit_event:
        mfa_flow.audit_mfa_failure(user, reason="invalid_mfa_code")

    audit_event.assert_called_once_with(
        "user-id",
        AuditAction.MFA_FAILURE,
        "mfa",
        "user-id",
        context=AuditContext(outcome="denied", reason="invalid_mfa_code"),
    )


async def test_confirm_totp_setup_consumes_setup_only_after_valid_code() -> None:
    """TOTP setup confirmation should consume setup state only after verification succeeds."""
    user, user_manager = build_mfa_user(mfa_enabled=False, mfa_totp_secret=None)
    user_manager.password_helper.verify_and_update = MagicMock(return_value=(True, None))
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)
        ) as get_setup,
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code", new=AsyncMock(return_value=42)),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_totp_setup",
            new=AsyncMock(return_value=setup),
        ) as consume,
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        patch("app.api.auth.services.mfa_flow.mfa_service.burn_totp_counter", new=AsyncMock()) as burn,
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()) as notify,
        patch("app.api.auth.services.mfa_flow.refresh_token_service.create_refresh_token", new=AsyncMock()),
    ):
        result = await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456", password=SecretStr("pw")),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
            response=Response(),
            session_strategy=MagicMock(write_token=AsyncMock(return_value="access-token")),
            bearer=False,
        )

    # The setup token is bound to the enrolling user on both the read and the consume.
    get_setup.assert_awaited_once_with(ANY, "setup-token", user_id=user.id)
    consume.assert_awaited_once_with(ANY, "setup-token", user_id=user.id)
    enable.assert_awaited_once_with(ANY, user_manager, user, "secret")
    # The time-step burns only after enrollment succeeds, so a failed commit
    # doesn't lock the still-valid code out of a retry.
    burn.assert_awaited_once_with(ANY, user_id=user.id, counter=42)
    notify.assert_awaited_once()
    assert notify.call_args.kwargs["enabled"] is True
    # Recovery codes are handed back exactly once, at enrollment.
    assert len(result.recovery_codes) == 10
    # Only the hashes are persisted: a DB compromise must not yield usable codes.
    set_codes.assert_awaited_once_with(
        user_manager, user, [mfa_service.hash_recovery_code(code) for code in result.recovery_codes]
    )


async def test_confirm_totp_setup_rejects_wrong_password() -> None:
    """Enrollment must not enable MFA when the reauth password is wrong."""
    user, user_manager = build_mfa_user(mfa_enabled=False, mfa_totp_secret=None)
    user_manager.password_helper.verify_and_update = MagicMock(return_value=(False, None))
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        pytest.raises(HTTPException) as exc,
    ):
        await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456", password=SecretStr("wrong")),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
            response=Response(),
            session_strategy=MagicMock(write_token=AsyncMock(return_value="access-token")),
            bearer=False,
        )

    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    enable.assert_not_awaited()


async def test_confirm_totp_setup_allows_oauth_only_account_without_password() -> None:
    """An OAuth-only account (no usable password) can enable MFA on the session alone.

    Regression: verify_current_password ran unconditionally, so an account created via
    Google/GitHub (random password, has_usable_password=False) got 401 and could never
    turn MFA on.
    """
    user, user_manager = build_mfa_user(
        mfa_enabled=False, mfa_totp_secret=None, has_usable_password=False, last_login_at=datetime.now(UTC)
    )

    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code", new=AsyncMock(return_value=42)),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        patch("app.api.auth.services.mfa_flow.mfa_service.burn_totp_counter", new=AsyncMock()),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()),
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()),
        patch("app.api.auth.services.mfa_flow.refresh_token_service.create_refresh_token", new=AsyncMock()),
    ):
        result = await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
            response=Response(),
            session_strategy=MagicMock(write_token=AsyncMock(return_value="access-token")),
            bearer=False,
        )

    enable.assert_awaited_once()
    assert len(result.recovery_codes) == 10
    # The password helper is never consulted for a password-less account.
    user_manager.password_helper.verify_and_update.assert_not_called()


async def test_confirm_totp_setup_refuses_passwordless_account_with_stale_sign_in() -> None:
    """With no password to re-enter, enrolment needs a recent sign-in, not just a live session."""
    user, user_manager = build_mfa_user(
        mfa_enabled=False,
        mfa_totp_secret=None,
        has_usable_password=False,
        last_login_at=datetime.now(UTC) - RECENT_SIGN_IN_WINDOW - timedelta(minutes=1),
    )
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        pytest.raises(RecentSignInRequiredError),
    ):
        await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
            response=Response(),
            session_strategy=MagicMock(write_token=AsyncMock(return_value="access-token")),
            bearer=False,
        )

    enable.assert_not_awaited()


async def test_confirm_totp_setup_requires_password_when_account_has_one() -> None:
    """An account with a usable password must still supply it (400 when omitted)."""
    user, user_manager = build_mfa_user(mfa_enabled=False, mfa_totp_secret=None, has_usable_password=True)
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        pytest.raises(HTTPException) as exc,
    ):
        await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
            response=Response(),
            session_strategy=MagicMock(write_token=AsyncMock(return_value="access-token")),
            bearer=False,
        )

    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    enable.assert_not_awaited()


async def test_disable_totp_clears_enrollment_after_valid_code() -> None:
    """Disabling TOTP with a current code should clear the enrollment."""
    user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret")
    redis = MagicMock()

    with (
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)
        ) as verify,
        patch("app.api.auth.services.mfa_flow.mfa_service.clear_totp", new=AsyncMock()) as clear,
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()) as notify,
    ):
        await mfa_flow.disable_totp(
            MfaTotpDisableRequest(code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=redis,
            background_tasks=MagicMock(),
        )

    verify.assert_awaited_once_with(redis, user_id="user-id", secret="totp-secret", code="123456")
    clear.assert_awaited_once_with(user_manager, user)
    notify.assert_awaited_once()
    assert notify.call_args.kwargs["enabled"] is False


async def test_disable_totp_invalid_code_keeps_enrollment() -> None:
    """An invalid code must not clear the TOTP enrollment."""
    user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret")

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=False)),
        patch("app.api.auth.services.mfa_flow.mfa_service.clear_totp", new=AsyncMock()) as clear,
        patch("app.api.auth.services.mfa_flow.audit_event") as audit_event,
        pytest.raises(MfaStepUpCodeInvalidError),
    ):
        await mfa_flow.disable_totp(
            MfaTotpDisableRequest(code="000000"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    clear.assert_not_awaited()
    assert any(call.args[1] == AuditAction.MFA_FAILURE for call in audit_event.call_args_list)


async def test_complete_mfa_challenge_accepts_recovery_code() -> None:
    """A valid recovery code should complete login and be consumed (removed)."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    challenge.transport = "bearer"
    user, user_manager = build_mfa_user(
        mfa_enabled=True, mfa_totp_secret="totp-secret", mfa_recovery_codes=["hash-a", "hash-b"]
    )

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge",
            new=AsyncMock(return_value=challenge),
        ) as consume_challenge,
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_recovery_code", return_value=["hash-b"]),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock()) as verify_totp,
        patch(
            "app.api.auth.services.mfa_flow.login_completion.issue_bearer_login_response",
            new=AsyncMock(return_value="login-response"),
        ),
        patch("app.api.auth.services.mfa_flow.audit_event") as audit_event,
    ):
        result = await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="ABCDE-FGHIJ"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    consume_challenge.assert_awaited_once()
    set_codes.assert_awaited_once_with(user_manager, user, ["hash-b"])
    verify_totp.assert_not_awaited()  # a non-6-digit code never touches the TOTP path
    assert result == "login-response"
    audit_event.assert_called_once_with(
        "user-id",
        AuditAction.MFA_SUCCESS,
        "mfa",
        "user-id",
        context=AuditContext(transport="bearer", flow="login_challenge", operation="recovery"),
    )


async def test_complete_mfa_challenge_session_transport_sets_cookies() -> None:
    """A session-transport challenge signs in through cookies and returns no token body."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    challenge.transport = mfa_service.SESSION_TRANSPORT
    user, user_manager = build_mfa_user(is_active=True, mfa_enabled=True, mfa_totp_secret="totp-secret")
    response = Response()
    redis = MagicMock()
    cookie_strategy = MagicMock()

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge",
            new=AsyncMock(return_value=challenge),
        ),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch(
            "app.api.auth.services.mfa_flow.login_completion.issue_session_login_response", new=AsyncMock()
        ) as issue_session,
        patch(
            "app.api.auth.services.mfa_flow.login_completion.issue_bearer_login_response", new=AsyncMock()
        ) as issue_bearer,
    ):
        result = await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="123456"),
            response=response,
            user_manager=user_manager,
            redis=redis,
            bearer_strategy=MagicMock(),
            cookie_strategy=cookie_strategy,
        )

    assert result is None
    issue_session.assert_awaited_once_with(
        response=response, user=user, user_manager=user_manager, redis=redis, cookie_strategy=cookie_strategy
    )
    issue_bearer.assert_not_awaited()
    set_codes.assert_not_awaited()  # a TOTP code leaves the recovery codes alone


async def test_complete_mfa_challenge_rejects_bad_recovery_code() -> None:
    """An unknown recovery code must not consume the login challenge."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    _user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret", mfa_recovery_codes=["hash-a"])

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_recovery_code", return_value=None),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge", new=AsyncMock()
        ) as consume_challenge,
        pytest.raises(MfaCodeInvalidError),
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="WRONG-CODE0"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    consume_challenge.assert_not_awaited()


async def test_regenerate_recovery_codes_reissues_after_valid_code() -> None:
    """Regenerating with a current TOTP code should return a fresh set of codes."""
    user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret")
    redis = MagicMock()

    with (
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)
        ) as verify,
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch("app.api.auth.services.mfa_flow.send_recovery_codes_regenerated_notification", new=AsyncMock()) as notify,
    ):
        result = await mfa_flow.regenerate_recovery_codes(
            MfaRecoveryCodesRegenerateRequest(code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=redis,
            background_tasks=MagicMock(),
        )

    verify.assert_awaited_once_with(redis, user_id="user-id", secret="totp-secret", code="123456")
    notify.assert_awaited_once()
    assert len(result.recovery_codes) == 10
    # Only the hashes are persisted: a DB compromise must not yield usable codes.
    set_codes.assert_awaited_once_with(
        user_manager, user, [mfa_service.hash_recovery_code(code) for code in result.recovery_codes]
    )


async def test_regenerate_recovery_codes_rejects_invalid_code() -> None:
    """A wrong TOTP code must not rotate the recovery codes of an enrolled user."""
    user, user_manager = build_mfa_user(mfa_enabled=True, mfa_totp_secret="totp-secret")

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=False)),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        pytest.raises(MfaStepUpCodeInvalidError),
    ):
        await mfa_flow.regenerate_recovery_codes(
            MfaRecoveryCodesRegenerateRequest(code="000000"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    set_codes.assert_not_awaited()


async def test_disable_totp_accepts_recovery_code() -> None:
    """A user who lost their authenticator can disable MFA with a recovery code."""
    user, user_manager = build_mfa_user(
        mfa_enabled=True, mfa_totp_secret="totp-secret", mfa_recovery_codes=["hash-a", "hash-b"]
    )

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock()) as verify_totp,
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_recovery_code", return_value=["hash-b"]),
        patch("app.api.auth.services.mfa_flow.mfa_service.clear_totp", new=AsyncMock()) as clear,
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()),
    ):
        await mfa_flow.disable_totp(
            MfaTotpDisableRequest(code="ABCDE-FGHIJ"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    clear.assert_awaited_once_with(user_manager, user)
    verify_totp.assert_not_awaited()  # a non-6-digit code never touches the TOTP path


async def test_complete_mfa_challenge_keeps_recovery_code_when_challenge_consume_fails() -> None:
    """A failed challenge-consume must not burn the one-time recovery code."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    _user, user_manager = build_mfa_user(
        mfa_enabled=True, mfa_totp_secret="totp-secret", mfa_recovery_codes=["hash-a", "hash-b"]
    )

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_recovery_code", return_value=["hash-b"]),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        pytest.raises(RuntimeError),
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="ABCDE-FGHIJ"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    set_codes.assert_not_awaited()  # code stays valid because login never completed


async def test_complete_mfa_challenge_rejects_deleted_user() -> None:
    """A login challenge for a hard-deleted user should be rejected, not crash with a 500."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(side_effect=UserNotExists)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        pytest.raises(MfaChallengeInvalidError),
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="000000"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )


async def test_complete_mfa_challenge_rejects_deactivated_user() -> None:
    """A deactivated user must not be able to complete a pending MFA challenge."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    user, user_manager = build_mfa_user(is_active=False, mfa_enabled=True, mfa_totp_secret="totp-secret")

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock()) as verify_code,
        patch("app.api.auth.services.mfa_flow.audit_mfa_failure") as audit_failure,
        pytest.raises(HTTPException) as exc_info,
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="000000"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == ErrorCode.LOGIN_BAD_CREDENTIALS
    audit_failure.assert_called_once_with(user, reason="user_inactive")
    verify_code.assert_not_awaited()


@pytest.mark.parametrize(
    ("mfa_enabled", "mfa_totp_secret"),
    [(True, None), (False, "totp-secret")],
    ids=["enabled_without_secret", "secret_without_enabled"],
)
async def test_complete_mfa_challenge_rejects_half_enrolled_user(
    *, mfa_enabled: bool, mfa_totp_secret: str | None
) -> None:
    """A challenge for an account without both the MFA flag and a secret is refused before any code check."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    user, user_manager = build_mfa_user(is_active=True, mfa_enabled=mfa_enabled, mfa_totp_secret=mfa_totp_secret)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock()) as verify_code,
        patch("app.api.auth.services.mfa_flow.audit_mfa_failure") as audit_failure,
        pytest.raises(MfaCodeInvalidError),
    ):
        await mfa_flow.complete_mfa_challenge(
            MfaChallengeRequest(mfa_token=SecretStr("mfa-token"), code="123456"),
            response=Response(),
            user_manager=user_manager,
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    audit_failure.assert_called_once_with(user, reason="mfa_not_enabled")
    verify_code.assert_not_awaited()


def _account_update(mfa_code: str | None = None) -> UserUpdate:
    """An email change carrying the current password, and the MFA code when given."""
    return UserUpdate(email="new@example.com", current_password=SecretStr("current-passphrase-42"), mfa_code=mfa_code)


async def test_account_update_step_up_requires_current_password() -> None:
    """An email or password change without the current password is refused with a named action."""
    user, user_manager = build_mfa_user(mfa_enabled=False)

    with pytest.raises(HTTPException) as exc_info:
        await mfa_flow.require_account_update_step_up(
            UserUpdate(email="new@example.com"), user=user, user_manager=user_manager, request=MagicMock()
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Current password is required to change your email or password."


async def test_account_update_step_up_requires_mfa_code_when_enrolled() -> None:
    """An MFA account must send its code too, and the refusal names the action."""
    user, user_manager = build_mfa_user(mfa_enabled=True)

    with pytest.raises(HTTPException) as exc_info:
        await mfa_flow.require_account_update_step_up(
            _account_update(), user=user, user_manager=user_manager, request=MagicMock()
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Authentication code is required to change your email or password."
    user_manager.password_helper.verify_and_update.assert_not_called()


async def test_account_update_step_up_needs_request_to_check_mfa_code() -> None:
    """Without a request there is no Redis to check the code against, which is a programming error."""
    user, user_manager = build_mfa_user(mfa_enabled=True)
    user_manager.password_helper.verify_and_update = MagicMock(return_value=(True, None))

    with pytest.raises(RuntimeError) as exc_info:
        await mfa_flow.require_account_update_step_up(
            _account_update("123456"), user=user, user_manager=user_manager, request=None
        )

    assert str(exc_info.value) == "Request context is required to verify an authentication code."


async def test_account_update_step_up_burns_matched_recovery_code() -> None:
    """A recovery code used to approve an email or password change cannot be used again."""
    user, user_manager = build_mfa_user(
        mfa_enabled=True, mfa_totp_secret="totp-secret", mfa_recovery_codes=["hash-a", "hash-b"]
    )
    user_manager.password_helper.verify_and_update = MagicMock(return_value=(True, None))

    with (
        patch("app.api.auth.services.mfa_flow.require_connection_redis", return_value=MagicMock()),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_recovery_code", return_value=["hash-b"]),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
    ):
        await mfa_flow.require_account_update_step_up(
            _account_update("ABCDE-FGHIJ"),
            user=user,
            user_manager=user_manager,
            request=MagicMock(),
        )

    set_codes.assert_awaited_once_with(user_manager, user, ["hash-b"])
