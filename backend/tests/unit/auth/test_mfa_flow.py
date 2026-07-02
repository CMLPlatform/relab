"""Unit tests for MFA flow orchestration."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Response
from pydantic import SecretStr

from app.api.auth.exceptions import MfaCodeInvalidError
from app.api.auth.schemas import MfaChallengeRequest, MfaOAuthClaimRequest, MfaTotpConfirmRequest
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
    setup = MagicMock()
    setup.secret = "secret"

    with (
        patch("app.api.auth.services.mfa_flow.mfa_service.get_totp_setup", new=AsyncMock(return_value=setup)),
        patch("app.api.auth.services.mfa_flow.mfa_service.verify_totp_code_once", new=AsyncMock(return_value=True)),
        patch(
            "app.api.auth.services.mfa_flow.mfa_service.consume_totp_setup",
            new=AsyncMock(return_value=setup),
        ) as consume,
        patch("app.api.auth.services.mfa_flow.mfa_service.enable_totp", new=AsyncMock()),
    ):
        await mfa_flow.confirm_totp_setup(
            MfaTotpConfirmRequest(setup_token=SecretStr("setup-token"), code="123456"),
            current_user=user,
            user_manager=user_manager,
            redis=MagicMock(),
        )

    consume.assert_awaited_once()
