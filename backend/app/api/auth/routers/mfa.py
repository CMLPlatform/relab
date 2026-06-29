"""TOTP MFA setup and challenge routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi_users.authentication import Strategy

from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.schemas import (
    MfaChallengeRequest,
    MfaOAuthClaimRequest,
    MfaPendingResponse,
    MfaTotpConfirmRequest,
    MfaTotpSetupResponse,
    RefreshTokenResponse,
)
from app.api.auth.services import mfa_flow
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT, limiter
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.core.redis import RedisDep

router = APIRouter(prefix="/mfa", tags=["auth"], dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)])


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
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def confirm_totp_setup(
    payload: MfaTotpConfirmRequest,
    current_user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    redis: RedisDep,
) -> None:
    """Confirm authenticated TOTP enrollment."""
    await mfa_flow.confirm_totp_setup(payload, current_user=current_user, user_manager=user_manager, redis=redis)


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
