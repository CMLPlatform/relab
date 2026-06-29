"""Password login routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorModel

from app.api.auth.schemas import MfaPendingResponse, RefreshTokenResponse
from app.api.auth.services import login_flow
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT, limiter
from app.api.auth.services.user_manager import (
    UserManager,
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.core.redis import RedisDep

AUTH_ERROR_RESPONSES: dict[int | str, dict[str, object]] = {400: {"model": ErrorModel}}

router = APIRouter()


@router.post(
    "/bearer/login",
    name="auth:bearer.login",
    tags=["auth"],
    response_model=RefreshTokenResponse | MfaPendingResponse,
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for bearer-token clients",
    dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)],
)
async def bearer_login(
    response: Response,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
    redis: RedisDep,
    bearer_strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
) -> RefreshTokenResponse | MfaPendingResponse:
    """Authenticate a bearer client and return access and refresh tokens in JSON."""
    user = await login_flow.authenticate_first_factor(credentials, user_manager, "bearer")
    return await login_flow.complete_bearer_login(
        response=response,
        user=user,
        user_manager=user_manager,
        redis=redis,
        bearer_strategy=bearer_strategy,
    )


@router.post(
    "/session/login",
    name="auth:session.login",
    tags=["auth"],
    response_model=MfaPendingResponse | None,
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for browser sessions",
    dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)],
)
async def session_login(
    response: Response,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
    redis: RedisDep,
    cookie_strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
) -> MfaPendingResponse | None:
    """Authenticate a browser client and return MFA challenge only when MFA is enabled."""
    user = await login_flow.authenticate_first_factor(credentials, user_manager, "session")
    return await login_flow.complete_session_login(
        response=response,
        user=user,
        user_manager=user_manager,
        redis=redis,
        cookie_strategy=cookie_strategy,
    )
