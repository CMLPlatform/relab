"""Refresh token and multi-device session management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status
from fastapi.security import OAuth2PasswordBearer
from fastapi_users.authentication import Strategy

from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.exceptions import RefreshTokenNotFoundError
from app.api.auth.schemas import (
    RefreshTokenRequest,
    RefreshTokenResponse,
)
from app.api.auth.services import session_flow
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
)
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.core.redis import RedisDep

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/bearer/login", auto_error=False)
SESSION_LOGOUT_CLEAR_SITE_DATA = session_flow.SESSION_LOGOUT_CLEAR_SITE_DATA

router = APIRouter()


@router.post(
    "/bearer/refresh",
    name="auth:bearer.refresh",
    response_model=RefreshTokenResponse,
)
async def refresh_access_token(
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: RedisDep,
    request: RefreshTokenRequest | None = None,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token for bearer auth.

    Validates refresh token and issues new access token.
    """
    if request is None:
        raise RefreshTokenNotFoundError
    return await session_flow.refresh_bearer_tokens(
        user_manager=user_manager,
        strategy=strategy,
        redis=redis,
        refresh_token=request.refresh_token.get_secret_value(),
    )


@router.post(
    "/session/refresh",
    name="auth:session.refresh",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def refresh_access_token_cookie(
    response: Response,
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
    redis: RedisDep,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> None:
    """Refresh access token using refresh token from cookie.

    Validates refresh token cookie and issues new access token cookie.
    """
    if not refresh_token:
        raise RefreshTokenNotFoundError
    await session_flow.refresh_session_cookies(
        response=response,
        user_manager=user_manager,
        strategy=strategy,
        redis=redis,
        refresh_token=refresh_token,
    )


@router.post(
    "/bearer/logout",
    name="auth:bearer.logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_bearer(
    current_user: CurrentActiveUserDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: RedisDep,
    bearer_token: Annotated[str | None, Depends(oauth2_scheme)] = None,
    request: RefreshTokenRequest | None = None,
) -> None:
    """Logout a bearer client and revoke its supplied refresh token."""
    await session_flow.logout_bearer(
        current_user=current_user,
        strategy=strategy,
        redis=redis,
        bearer_token=bearer_token,
        refresh_token=request.refresh_token.get_secret_value() if request else None,
    )


@router.post(
    "/session/logout",
    name="auth:session.logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_session(
    response: Response,
    current_user: CurrentActiveUserDep,
    strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
    redis: RedisDep,
    cookie_refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
    cookie_auth_token: Annotated[str | None, Cookie(alias=AUTH_COOKIE_NAME)] = None,
) -> None:
    """Logout a browser session, revoke refresh state, and clear browser storage."""
    await session_flow.logout_session(
        response=response,
        current_user=current_user,
        strategy=strategy,
        redis=redis,
        cookie_refresh_token=cookie_refresh_token,
        cookie_auth_token=cookie_auth_token,
    )


@router.post(
    "/sessions/revoke-all",
    name="auth:sessions.revoke_all",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_all_sessions(
    response: Response,
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
) -> None:
    """Revoke all refresh tokens for the current user and clear browser session state."""
    await session_flow.revoke_all_sessions(response=response, current_user=current_user, redis=redis)
