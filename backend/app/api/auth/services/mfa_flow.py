"""MFA route orchestration."""

from __future__ import annotations

from fastapi import Response, status
from fastapi_users.authentication import Strategy
from pydantic import SecretStr

from app.api.auth.exceptions import MfaChallengeInvalidError, MfaCodeInvalidError
from app.api.auth.models import User
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaPendingResponse,
    MfaTotpConfirmRequest,
    MfaTotpSetupResponse,
    RefreshTokenResponse,
)
from app.api.auth.services import login_completion, mfa_enrollment, mfa_service
from app.api.auth.services.user_manager import UserManager
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.redis import Redis


def get_mfa_token(token: SecretStr) -> str:
    """Extract, rate-limit, and return the raw MFA token value."""
    raw = token.get_secret_value()
    mfa_service.enforce_mfa_token_rate_limit(raw)
    return raw


async def start_totp_setup(*, current_user: User, redis: Redis) -> MfaTotpSetupResponse:
    """Start authenticated TOTP enrollment."""
    if current_user.mfa_enabled or current_user.mfa_totp_secret:
        raise MfaChallengeInvalidError
    secret = mfa_service.generate_totp_secret()
    setup_token = await mfa_service.create_totp_setup(redis, user_id=current_user.id, secret=secret)
    return MfaTotpSetupResponse(
        setup_token=setup_token,
        secret=secret,
        otpauth_uri=mfa_service.build_totp_uri(
            secret=secret,
            email=current_user.email,
            username=current_user.username,
        ),
    )


async def confirm_totp_setup(
    payload: MfaTotpConfirmRequest,
    *,
    current_user: User,
    user_manager: UserManager,
    redis: Redis,
) -> None:
    """Confirm authenticated TOTP enrollment."""
    setup_token = get_mfa_token(payload.setup_token)
    setup = await mfa_service.get_totp_setup(redis, setup_token, user_id=current_user.id)
    user = await user_manager.get(current_user.id)
    if user.mfa_enabled or user.mfa_totp_secret:
        raise MfaChallengeInvalidError
    if not await mfa_service.verify_totp_code_once(
        redis,
        user_id=current_user.id,
        secret=setup.secret,
        code=payload.code,
    ):
        audit_event(
            current_user.id,
            AuditAction.MFA_FAILURE,
            "mfa",
            current_user.id,
            context=AuditContext(outcome="denied", reason="invalid_totp_setup_code"),
        )
        raise MfaCodeInvalidError

    setup = await mfa_service.consume_totp_setup(redis, setup_token, user_id=current_user.id)
    await mfa_enrollment.enable_totp(user_manager, user, setup.secret)
    audit_event(
        current_user.id, AuditAction.MFA_SUCCESS, "mfa", current_user.id, context=AuditContext(flow="totp_setup")
    )


async def claim_oauth_mfa_handoff(payload: MfaOAuthClaimRequest, *, redis: Redis) -> MfaPendingResponse:
    """Claim a one-time OAuth MFA handoff and return pending MFA state."""
    handoff = get_mfa_token(payload.mfa_handoff)
    mfa_token = await mfa_service.consume_oauth_handoff(redis, handoff)
    return MfaPendingResponse(mfa_token=mfa_token)


async def complete_mfa_challenge(
    payload: MfaChallengeRequest,
    *,
    response: Response,
    user_manager: UserManager,
    redis: Redis,
    bearer_strategy: Strategy,
    cookie_strategy: Strategy,
) -> RefreshTokenResponse | None:
    """Complete login for a user with TOTP already enabled."""
    mfa_token = get_mfa_token(payload.mfa_token)
    challenge = await mfa_service.get_login_challenge(redis, mfa_token)
    user = await user_manager.get(challenge.user_id)
    if not user.mfa_enabled or not user.mfa_totp_secret:
        audit_mfa_failure(user, reason="mfa_not_enabled")
        raise MfaCodeInvalidError
    if not await mfa_service.verify_totp_code_once(
        redis,
        user_id=user.id,
        secret=user.mfa_totp_secret,
        code=payload.code,
    ):
        audit_mfa_failure(user, reason="invalid_totp_code")
        raise MfaCodeInvalidError

    challenge = await mfa_service.consume_login_challenge(redis, mfa_token)
    audit_event(
        user.id,
        AuditAction.MFA_SUCCESS,
        "mfa",
        user.id,
        context=AuditContext(transport=challenge.transport, flow="login_challenge"),
    )
    if challenge.transport == mfa_service.SESSION_TRANSPORT:
        await login_completion.issue_session_login_response(
            response=response,
            user=user,
            user_manager=user_manager,
            redis=redis,
            cookie_strategy=cookie_strategy,
        )
        response.status_code = status.HTTP_204_NO_CONTENT
        return None

    return await login_completion.issue_bearer_login_response(
        user=user,
        user_manager=user_manager,
        redis=redis,
        bearer_strategy=bearer_strategy,
    )


def audit_mfa_failure(user: User, *, reason: str) -> None:
    """Emit the stable MFA failure audit event."""
    audit_event(
        user.id,
        AuditAction.MFA_FAILURE,
        "mfa",
        user.id,
        context=AuditContext(outcome="denied", reason=reason),
    )
