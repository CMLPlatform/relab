"""TOTP MFA setup and challenge routes."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from fastapi.security.utils import get_authorization_scheme_param
from fastapi_users.authentication import Strategy

from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
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
from app.api.auth.services import mfa_flow
from app.api.auth.services.rate_limiter import LOGIN_IP_RATE_LIMIT
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.api.common.rate_limiting import limiter
from app.core.redis import RedisDep

_BEARER_SCHEME = "bearer"

# The login IP budget, shared with password login. Guessing is capped per account by
# account_guess_budget, which mfa_flow charges on every credential check, right or wrong,
# and per challenge token (mfa_service), not by this per-IP limit.
router = APIRouter(
    prefix="/mfa", tags=["auth"], dependencies=[limiter.dependency(LOGIN_IP_RATE_LIMIT, name="login_ip_rate_limit")]
)


@router.post(
    "/totp/setup",
    response_model=MfaTotpSetupResponse,
)
async def start_totp_setup(
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
) -> MfaTotpSetupResponse:
    """Start authenticated TOTP enrollment for an account that opted into MFA."""
    return await mfa_flow.start_totp_setup(current_user=current_user, redis=redis)


@router.post(
    "/totp/confirm",
    response_model=MfaTotpConfirmResponse,
)
async def confirm_totp_setup(
    payload: MfaTotpConfirmRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    redis: RedisDep,
    bearer_strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    cookie_strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
) -> MfaTotpConfirmResponse:
    """Confirm TOTP enrollment, return one-time recovery codes, and replace the session.

    Enrolment signs out every other session. A client that authenticated with a bearer
    token gets new tokens in ``tokens``; a browser session gets new cookies.
    """
    scheme, _ = get_authorization_scheme_param(request.headers.get("authorization"))
    bearer = scheme.lower() == _BEARER_SCHEME
    return await mfa_flow.confirm_totp_setup(
        payload,
        current_user=current_user,
        user_manager=user_manager,
        redis=redis,
        background_tasks=background_tasks,
        response=response,
        session_strategy=bearer_strategy if bearer else cookie_strategy,
        bearer=bearer,
    )


@router.post(
    "/totp/disable",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def disable_totp(
    payload: MfaTotpDisableRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    redis: RedisDep,
) -> None:
    """Turn off TOTP MFA after confirming a current code."""
    await mfa_flow.disable_totp(
        payload,
        current_user=current_user,
        user_manager=user_manager,
        redis=redis,
        background_tasks=background_tasks,
    )


@router.post(
    "/recovery-codes/regenerate",
    response_model=MfaRecoveryCodesResponse,
)
async def regenerate_recovery_codes(
    payload: MfaRecoveryCodesRegenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    redis: RedisDep,
) -> MfaRecoveryCodesResponse:
    """Reissue recovery codes after confirming a current TOTP code."""
    return await mfa_flow.regenerate_recovery_codes(
        payload,
        current_user=current_user,
        user_manager=user_manager,
        redis=redis,
        background_tasks=background_tasks,
    )


@router.post(
    "/oauth/claim",
    response_model=MfaPendingResponse,
)
async def claim_oauth_mfa_handoff(
    payload: MfaOAuthClaimRequest,
    redis: RedisDep,
) -> MfaPendingResponse:
    """Claim a one-time OAuth MFA handoff and return pending MFA state."""
    return await mfa_flow.claim_oauth_mfa_handoff(payload, redis=redis)


@router.post(
    "/challenge",
    response_model=RefreshTokenResponse | None,
)
async def complete_mfa_challenge(
    payload: MfaChallengeRequest,
    response: Response,
    user_manager: UserManagerDep,
    redis: RedisDep,
    bearer_strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    cookie_strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
) -> RefreshTokenResponse | None:
    """Complete login for a user with TOTP already enabled."""
    return await mfa_flow.complete_mfa_challenge(
        payload,
        response=response,
        user_manager=user_manager,
        redis=redis,
        bearer_strategy=bearer_strategy,
        cookie_strategy=cookie_strategy,
    )
