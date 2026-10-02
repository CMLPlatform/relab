"""MFA route orchestration."""

from fastapi import BackgroundTasks, HTTPException, Response, status
from fastapi_users.authentication import Strategy
from fastapi_users.exceptions import UserNotExists
from fastapi_users.router.common import ErrorCode
from pydantic import SecretStr

from app.api.auth.config import settings as auth_settings
from app.api.auth.exceptions import MfaChallengeInvalidError, MfaCodeInvalidError, MfaStepUpCodeInvalidError
from app.api.auth.models import User
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaPendingResponse,
    MfaRecoveryCodesRegenerateRequest,
    MfaRecoveryCodesResponse,
    MfaTotpConfirmRequest,
    MfaTotpConfirmResponse,
    MfaTotpDisableRequest,
    MfaTotpSetupResponse,
    RefreshTokenResponse,
)
from app.api.auth.services import account_security, login_completion, mfa_service, refresh_token_service
from app.api.auth.services.auth_backends import set_session_auth_cookies
from app.api.auth.services.email.service import (
    send_mfa_changed_notification,
    send_recovery_codes_regenerated_notification,
)
from app.api.auth.services.rate_limiter import account_guess_budget
from app.api.auth.services.user_manager import UserManager
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.redis import Redis


async def get_mfa_token(token: SecretStr) -> str:
    """Extract, rate-limit, and return the raw MFA token value."""
    raw = token.get_secret_value()
    await mfa_service.enforce_mfa_token_rate_limit(raw)
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
    background_tasks: BackgroundTasks,
    response: Response,
    session_strategy: Strategy,
    bearer: bool,
) -> MfaTotpConfirmResponse:
    """Confirm authenticated TOTP enrollment and issue one-time recovery codes.

    Enrolment revokes every earlier session, so the enrolling client gets a fresh one:
    bearer tokens in the body when ``bearer``, otherwise new session cookies.
    """
    setup_token = await get_mfa_token(payload.setup_token)
    setup = await mfa_service.get_totp_setup(redis, setup_token, user_id=current_user.id)
    user = await user_manager.get(current_user.id)
    if user.mfa_enabled or user.mfa_totp_secret:
        raise MfaChallengeInvalidError
    # Reauthenticate before enabling (OWASP). OAuth-only accounts have no password to
    # re-enter, so they need a recent sign-in instead (same as oauth/accounts.py).
    account_security.require_recent_sign_in(user)
    # The password and setup code are guesses, so they spend the account's guess budget.
    async with account_guess_budget(user.id):
        account_security.require_step_up_password(
            password_helper=user_manager.password_helper,
            user=user,
            current_password=payload.password.get_secret_value() if payload.password else None,
            action="enable MFA",
        )
        counter = await mfa_service.verify_totp_code(
            redis,
            user_id=current_user.id,
            secret=setup.secret,
            code=payload.code,
        )
    if counter is None:
        audit_mfa_failure(user, reason="invalid_totp_setup_code")
        raise MfaStepUpCodeInvalidError

    setup = await mfa_service.consume_totp_setup(redis, setup_token, user_id=current_user.id)
    await mfa_service.enable_totp(redis, user_manager, user, setup.secret)
    # Burn only after enrollment is committed, so a failed commit can be retried with
    # the same code. The one-time setup token above already blocks replay.
    await mfa_service.burn_totp_counter(redis, user_id=current_user.id, counter=counter)
    codes, hashes = mfa_service.generate_recovery_codes()
    await mfa_service.set_recovery_codes(user_manager, user, hashes)
    audit_event(
        current_user.id, AuditAction.MFA_SUCCESS, "mfa", current_user.id, context=AuditContext(flow="totp_setup")
    )
    await send_mfa_changed_notification(user.email, user.username, enabled=True, background_tasks=background_tasks)
    # Not issue_*_login_response: enrolment is not a sign-in, so last_login_at stays put.
    access_token = await session_strategy.write_token(user)
    refresh_token = await refresh_token_service.create_refresh_token(redis, user.id)
    if not bearer:
        set_session_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
        return MfaTotpConfirmResponse(recovery_codes=codes)
    return MfaTotpConfirmResponse(
        recovery_codes=codes,
        tokens=RefreshTokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=auth_settings.access_token_ttl_seconds,
        ),
    )


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
    # Recovery codes are accepted so a lost authenticator can still turn MFA off.
    # clear_totp wipes the codes, so the matched one needs no persisting.
    async with account_guess_budget(user.id):
        verified = await _verify_challenge_code(payload.code, user=user, redis=redis)
    if verified is None:
        audit_mfa_failure(user, reason="invalid_totp_disable_code")
        raise MfaStepUpCodeInvalidError
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
    async with account_guess_budget(user.id):
        verified = user.mfa_totp_secret is not None and await mfa_service.verify_totp_code_once(
            redis,
            user_id=user.id,
            secret=user.mfa_totp_secret,
            code=payload.code,
        )
    if not verified:
        audit_mfa_failure(user, reason="invalid_totp_regenerate_code")
        raise MfaStepUpCodeInvalidError
    codes, hashes = mfa_service.generate_recovery_codes()
    await mfa_service.set_recovery_codes(user_manager, user, hashes)
    audit_event(
        user.id, AuditAction.MFA_SUCCESS, "mfa", user.id, context=AuditContext(flow="recovery_codes_regenerate")
    )
    # Notify out-of-band so a silent rotation cannot hide from the account owner.
    await send_recovery_codes_regenerated_notification(user.email, user.username, background_tasks=background_tasks)
    return MfaRecoveryCodesResponse(recovery_codes=codes)


async def claim_oauth_mfa_handoff(payload: MfaOAuthClaimRequest, *, redis: Redis) -> MfaPendingResponse:
    """Claim a one-time OAuth MFA handoff and return pending MFA state."""
    handoff = await get_mfa_token(payload.mfa_handoff)
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
    mfa_token = await get_mfa_token(payload.mfa_token)
    challenge = await mfa_service.get_login_challenge(redis, mfa_token)
    try:
        user = await user_manager.get(challenge.user_id)
    except UserNotExists:
        # The challenge is valid but its owner is gone (e.g. hard-deleted).
        raise MfaChallengeInvalidError from None
    if not user.is_active:
        audit_mfa_failure(user, reason="user_inactive")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.LOGIN_BAD_CREDENTIALS)
    if not user.mfa_enabled or not user.mfa_totp_secret:
        audit_mfa_failure(user, reason="mfa_not_enabled")
        raise MfaCodeInvalidError
    # Per account, not only per challenge token: signing in again with a known password
    # issues a fresh token, and must not buy fresh guesses.
    async with account_guess_budget(user.id):
        verified = await _verify_challenge_code(payload.code, user=user, redis=redis)
        if verified is None:
            audit_mfa_failure(user, reason="invalid_mfa_code")
            raise MfaCodeInvalidError
    factor, remaining_recovery = verified

    challenge = await mfa_service.consume_login_challenge(redis, mfa_token)
    if remaining_recovery is not None:
        # Burn the recovery code only after the challenge is consumed, so an expired
        # challenge cannot spend a code.
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


async def require_mfa_step_up(
    code: str | None, *, user: User, redis: Redis, action: str, user_manager: UserManager | None = None
) -> None:
    """Require a current TOTP or recovery code before a sensitive action, when MFA is on.

    Runs after the password step-up, so a stolen session plus a phished password still
    cannot act without the second factor. OAuth-only accounts with MFA need it too.
    """
    if not user.mfa_enabled:
        return
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Authentication code is required to {action}.",
        )
    verified = await _verify_challenge_code(code, user=user, redis=redis)
    if verified is None:
        audit_mfa_failure(user, reason="invalid_step_up_code")
        raise MfaStepUpCodeInvalidError
    # Pass user_manager to burn a matched recovery code. Account deletion omits it: the
    # account, codes included, is erased next.
    _factor, remaining_recovery = verified
    if remaining_recovery is not None and user_manager is not None:
        await mfa_service.set_recovery_codes(user_manager, user, remaining_recovery)


async def _verify_challenge_code(
    code: str,
    *,
    user: User,
    redis: Redis,
) -> tuple[str, list[str] | None] | None:
    """Validate a challenge code as TOTP (6 digits) or a single-use recovery code.

    Returns ``(factor, remaining_recovery_hashes)``: the factor used
    ("totp" | "recovery") and, for a matched recovery code, the reduced hash list
    the caller must persist *after* the login challenge is consumed (None for TOTP).
    Returns None if neither matched.

    A matched TOTP code is burned here so replay fails even if a later step does. A
    recovery code is only handed back, for the caller to persist once the challenge is
    spent, so a later failure cannot waste it.
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
