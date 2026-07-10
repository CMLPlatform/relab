"""Unit tests for MFA flow orchestration."""

from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Response, status
from fastapi_users.exceptions import UserNotExists
from pydantic import SecretStr

from app.api.auth.exceptions import MfaChallengeInvalidError, MfaCodeInvalidError
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaRecoveryCodesRegenerateRequest,
    MfaTotpConfirmRequest,
    MfaTotpDisableRequest,
)
from app.api.auth.services import mfa_flow
from app.api.common.audit import AuditAction


def test_get_mfa_token_applies_fingerprint_rate_limit() -> None:
    """Raw MFA tokens should be extracted through the shared token rate limiter."""
    with patch("app.api.auth.services.mfa_flow.mfa_service.enforce_mfa_token_rate_limit") as enforce:
        token = mfa_flow.get_mfa_token(SecretStr("token-value"))

    assert token == "token-value"
    enforce.assert_called_once_with("token-value")


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
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=False)),
        patch("app.api.auth.services.mfa_flow.mfa_service.consume_login_challenge", new=AsyncMock()) as consume,
        patch("app.api.auth.services.mfa_flow.audit_event") as audit_event,
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
    assert any(call.args[1] == AuditAction.MFA_FAILURE for call in audit_event.call_args_list)


async def test_confirm_totp_setup_consumes_setup_only_after_valid_code() -> None:
    """TOTP setup confirmation should consume setup state only after verification succeeds."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = False
    user.mfa_totp_secret = None
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)
    user_manager.password_helper.verify_and_update = MagicMock(return_value=(True, None))
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code", new=AsyncMock(return_value=42)),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_totp_setup",
            new=AsyncMock(return_value=setup),
        ) as consume,
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()) as enable,
        patch("app.api.auth.services.mfa_flow.mfa_service.burn_totp_counter", new=AsyncMock()) as burn,
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()) as notify,
    ):
        result = await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456", password=SecretStr("pw")),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    consume.assert_awaited_once()
    enable.assert_awaited_once()
    # The time-step burns only after enrollment succeeds, so a failed commit
    # doesn't lock the still-valid code out of a retry.
    burn.assert_awaited_once_with(ANY, user_id=user.id, counter=42)
    set_codes.assert_awaited_once()
    notify.assert_awaited_once()
    assert notify.call_args.kwargs["enabled"] is True
    # Recovery codes are handed back exactly once, at enrollment.
    assert len(result.recovery_codes) == 10


async def test_confirm_totp_setup_rejects_wrong_password() -> None:
    """Enrollment must not enable MFA when the reauth password is wrong."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = False
    user.mfa_totp_secret = None
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)
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
        )

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    enable.assert_not_awaited()


async def test_disable_totp_clears_enrollment_after_valid_code() -> None:
    """Disabling TOTP with a current code should clear the enrollment."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)),
        patch("app.api.auth.services.mfa_flow.mfa_service.clear_totp", new=AsyncMock()) as clear,
        patch("app.api.auth.services.mfa_flow.send_mfa_changed_notification", new=AsyncMock()) as notify,
    ):
        await mfa_flow.disable_totp(
            MfaTotpDisableRequest(code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    clear.assert_awaited_once_with(user_manager, user)
    notify.assert_awaited_once()
    assert notify.call_args.kwargs["enabled"] is False


async def test_disable_totp_invalid_code_keeps_enrollment() -> None:
    """An invalid code must not clear the TOTP enrollment."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=False)),
        patch("app.api.auth.services.mfa_flow.mfa_service.clear_totp", new=AsyncMock()) as clear,
        patch("app.api.auth.services.mfa_flow.audit_event") as audit_event,
        pytest.raises(MfaCodeInvalidError),
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
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user.mfa_recovery_codes = ["hash-a", "hash-b"]
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

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


async def test_complete_mfa_challenge_rejects_bad_recovery_code() -> None:
    """An unknown recovery code must not consume the login challenge."""
    challenge = MagicMock()
    challenge.user_id = "user-id"
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user.mfa_recovery_codes = ["hash-a"]
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

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
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)),
        patch("app.api.auth.services.mfa_flow.mfa_service.set_recovery_codes", new=AsyncMock()) as set_codes,
        patch("app.api.auth.services.mfa_flow.send_recovery_codes_regenerated_notification", new=AsyncMock()) as notify,
    ):
        result = await mfa_flow.regenerate_recovery_codes(
            MfaRecoveryCodesRegenerateRequest(code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
            background_tasks=MagicMock(),
        )

    set_codes.assert_awaited_once()
    notify.assert_awaited_once()
    assert len(result.recovery_codes) == 10


async def test_disable_totp_accepts_recovery_code() -> None:
    """A user who lost their authenticator can disable MFA with a recovery code."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user.mfa_recovery_codes = ["hash-a", "hash-b"]
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

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
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user.mfa_recovery_codes = ["hash-a", "hash-b"]
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

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
    user = MagicMock()
    user.id = "user-id"
    user.is_active = False
    user.mfa_enabled = True
    user.mfa_totp_secret = "totp-secret"
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_login_challenge", new=AsyncMock(return_value=challenge)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock()) as verify_code,
        patch("app.api.auth.services.mfa_flow.audit_event"),
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
    verify_code.assert_not_awaited()
