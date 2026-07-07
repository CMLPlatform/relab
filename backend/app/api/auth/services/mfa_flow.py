"""MFA route orchestration."""

from fastapi import BackgroundTasks, HTTPException, Response, status
from fastapi_users.authentication import Strategy
from pydantic import SecretStr

from app.api.auth.exceptions import MfaChallengeInvalidError, MfaCodeInvalidError
from app.api.auth.models import User
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaPendingResponse,
    MfaRecoveryCodesRegenerateRequest,
    MfaRecoveryCodesResponse,
    MfaTotpConfirmRequest,
    MfaTotpDisableRequest,
    MfaTotpSetupResponse,
    RefreshTokenResponse,
)
from app.api.auth.services import login_completion, mfa_service
from app.api.auth.services.email.service import (
    send_mfa_changed_notification,
    send_recovery_codes_regenerated_notification,
)
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


def _verify_current_password(user_manager: UserManager, user: User, password: SecretStr) -> None:
    """Reauthenticate with the account password before a sensitive MFA change."""
    is_valid, _ = user_manager.password_helper.verify_and_update(password.get_secret_value(), user.hashed_password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is invalid.")


async def confirm_totp_setup(
    payload: MfaTotpConfirmRequest,
    *,
    current_user: User,
    user_manager: UserManager,
    redis: Redis,
    background_tasks: BackgroundTasks,
) -> MfaRecoveryCodesResponse:
    """Confirm authenticated TOTP enrollment and issue one-time recovery codes."""
    setup_token = get_mfa_token(payload.setup_token)
    setup = await mfa_service.get_totp_setup(redis, setup_token, user_id=current_user.id)
    user = await user_manager.get(current_user.id)
    if user.mfa_enabled or user.mfa_totp_secret:
        raise MfaChallengeInvalidError
    # Reauthenticate before enabling: an active session alone isn't enough (OWASP).
    _verify_current_password(user_manager, user, payload.password)
    counter = await mfa_service.verify_totp_code(
        redis,
        user_id=current_user.id,
        secret=setup.secret,
        code=payload.code,
    )
    if counter is None:
        audit_event(
            current_user.id,
            AuditAction.MFA_FAILURE,
            "mfa",
            current_user.id,
            context=AuditContext(outcome="denied", reason="invalid_totp_setup_code"),
        )
        raise MfaCodeInvalidError

    setup = await mfa_service.consume_totp_setup(redis, setup_token, user_id=current_user.id)
    await mfa_service.enable_totp(user_manager, user, setup.secret)
    # Burn only after enrollment is committed: a failed commit must not lock the
    # still-valid code out of an immediate retry. Replay of the whole flow is
    # already blocked by the one-time setup token consumed above.
    await mfa_service.burn_totp_counter(redis, user_id=current_user.id, counter=counter)
    codes, hashes = mfa_service.generate_recovery_codes()
    await mfa_service.set_recovery_codes(user_manager, user, hashes)
    audit_event(
        current_user.id, AuditAction.MFA_SUCCESS, "mfa", current_user.id, context=AuditContext(flow="totp_setup")
    )
    await send_mfa_changed_notification(user.email, user.username, enabled=True, background_tasks=background_tasks)
    return MfaRecoveryCodesResponse(recovery_codes=codes)


async def _load_enrolled_mfa_user(user_manager: UserManager, current_user: User) -> User:
    """Load the user and assert TOTP MFA is currently enabled, or reject the change."""
    user = await user_manager.get(current_user.id)
    if not user.mfa_enabled or not user.mfa_totp_secret:
        raise MfaChallengeInvalidError
    return user


async def disable_totp(
    payload: MfaTotpDisableRequest,
    *,
    current_user: User,
    user_manager: UserManager,
    redis: Redis,
    background_tasks: BackgroundTasks,
) -> None:
    """Turn off TOTP MFA after confirming ownership with a current code or a recovery code."""
    user = await _load_enrolled_mfa_user(user_manager, current_user)
    # Accept a recovery code too: someone who lost their authenticator must still be
    # able to turn MFA off (then re-enroll) — that is exactly what recovery codes are for.
    # clear_totp wipes the codes anyway, so the matched code needn't be persisted here.
    if await _verify_challenge_code(payload.code, user=user, redis=redis) is None:
        audit_mfa_failure(user, reason="invalid_totp_disable_code")
        raise MfaCodeInvalidError
    await mfa_service.clear_totp(user_manager, user)
    audit_event(user.id, AuditAction.MFA_SUCCESS, "mfa", user.id, context=AuditContext(flow="totp_disable"))
    await send_mfa_changed_notification(user.email, user.username, enabled=False, background_tasks=background_tasks)


async def regenerate_recovery_codes(
    payload: MfaRecoveryCodesRegenerateRequest,
    *,
    current_user: User,
    user_manager: UserManager,
    redis: Redis,
    background_tasks: BackgroundTasks,
) -> MfaRecoveryCodesResponse:
    """Reissue recovery codes after confirming a current TOTP code."""
    user = await _load_enrolled_mfa_user(user_manager, current_user)
    if not await mfa_service.verify_totp_code_once(
        redis,
        user_id=user.id,
        secret=user.mfa_totp_secret,
        code=payload.code,
    ):
        audit_mfa_failure(user, reason="invalid_totp_regenerate_code")
        raise MfaCodeInvalidError
    codes, hashes = mfa_service.generate_recovery_codes()
    await mfa_service.set_recovery_codes(user_manager, user, hashes)
    audit_event(
        user.id, AuditAction.MFA_SUCCESS, "mfa", user.id, context=AuditContext(flow="recovery_codes_regenerate")
    )
    # Rotating codes invalidates every previously issued one — notify out-of-band, as
    # enable/disable already do, so a silent rotation can't hide from the account owner.
    await send_recovery_codes_regenerated_notification(user.email, user.username, background_tasks=background_tasks)
    return MfaRecoveryCodesResponse(recovery_codes=codes)


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
    """Complete login with either a TOTP code or a single-use recovery code."""
    mfa_token = get_mfa_token(payload.mfa_token)
    challenge = await mfa_service.get_login_challenge(redis, mfa_token)
    user = await user_manager.get(challenge.user_id)
    if not user.mfa_enabled or not user.mfa_totp_secret:
        audit_mfa_failure(user, reason="mfa_not_enabled")
        raise MfaCodeInvalidError
    verified = await _verify_challenge_code(payload.code, user=user, redis=redis)
    if verified is None:
        audit_mfa_failure(user, reason="invalid_mfa_code")
        raise MfaCodeInvalidError
    factor, remaining_recovery = verified

    challenge = await mfa_service.consume_login_challenge(redis, mfa_token)
    if remaining_recovery is not None:
        # Burn the one-time recovery code only after the login challenge is consumed,
        # so an already-consumed/expired challenge can't spend a code without a login.
        await mfa_service.set_recovery_codes(user_manager, user, remaining_recovery)
    audit_event(
        user.id,
        AuditAction.MFA_SUCCESS,
        "mfa",
        user.id,
        context=AuditContext(transport=challenge.transport, flow="login_challenge", operation=factor),
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


async def _verify_challenge_code(
    code: str,
    *,
    user: User,
    redis: Redis,
) -> tuple[str, list[str] | None] | None:
    """Validate a challenge code as TOTP (6 digits) or a single-use recovery code.

    Returns ``(factor, remaining_recovery_hashes)`` — the factor used
    ("totp" | "recovery") and, for a matched recovery code, the reduced hash list
    the caller must persist *after* the login challenge is consumed (None for TOTP).
    Returns None if neither matched. This function performs no writes so a failure
    later in the flow can't burn a recovery code with nothing to show for it.
    """
    if len(code) == 6 and code.isdecimal():
        if user.mfa_totp_secret and await mfa_service.verify_totp_code_once(
            redis, user_id=user.id, secret=user.mfa_totp_secret, code=code
        ):
            return "totp", None
        return None
    remaining = mfa_service.consume_recovery_code(user.mfa_recovery_codes, code)
    if remaining is None:
        return None
    return "recovery", remaining


def audit_mfa_failure(user: User, *, reason: str) -> None:
    """Emit the stable MFA failure audit event."""
    audit_event(
        user.id,
        AuditAction.MFA_FAILURE,
        "mfa",
        user.id,
        context=AuditContext(outcome="denied", reason=reason),
    )
