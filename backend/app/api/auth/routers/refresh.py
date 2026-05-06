"""Refresh token and multi-device session management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status
from fastapi.security import OAuth2PasswordBearer
from fastapi_users.authentication import Strategy

from app.api.auth.config import settings as auth_settings
from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.exceptions import RefreshTokenNotFoundError, RefreshTokenUserInactiveError
from app.api.auth.schemas import (
    RefreshTokenRequest,
    RefreshTokenResponse,
)
from app.api.auth.services import refresh_token_service
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_browser_auth_cookie,
)
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.core.redis import OptionalRedisDep

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/bearer/login", auto_error=False)
SESSION_LOGOUT_CLEAR_SITE_DATA = '"cache", "cookies", "storage"'

router = APIRouter()


async def _refresh_tokens_for_active_user(
    user_manager: UserManagerDep,
    strategy: Strategy,
    redis: OptionalRedisDep,
    refresh_token: str,
) -> tuple[str, str]:
    user_id = await refresh_token_service.verify_refresh_token(redis, refresh_token)

    user = await user_manager.get(user_id)
    if not user or not user.is_active:
        raise RefreshTokenUserInactiveError

    new_refresh_token = await refresh_token_service.rotate_refresh_token(redis, refresh_token)
    access_token = await strategy.write_token(user)
    return access_token, new_refresh_token


@router.post(
    "/bearer/refresh",
    name="auth:bearer.refresh",
    response_model=RefreshTokenResponse,
)
async def refresh_access_token(
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
    request: RefreshTokenRequest | None = None,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token for bearer auth.

    Validates refresh token and issues new access token.
    """
    if request is None:
        raise RefreshTokenNotFoundError
    actual_refresh_token = request.refresh_token.get_secret_value()
    access_token, new_refresh_token = await _refresh_tokens_for_active_user(
        user_manager,
        strategy,
        redis,
        actual_refresh_token,
    )

    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",  # noqa: S106 # This value is not a secret
        expires_in=auth_settings.access_token_ttl_seconds,
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
    redis: OptionalRedisDep,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    """Refresh access token using refresh token from cookie.

    Validates refresh token cookie and issues new access token cookie.
    """
    if not refresh_token:
        raise RefreshTokenNotFoundError
    access_token, new_refresh_token = await _refresh_tokens_for_active_user(
        user_manager,
        strategy,
        redis,
        refresh_token,
    )
    set_browser_auth_cookie(
        response,
        key=AUTH_COOKIE_NAME,
        value=access_token,
        max_age=auth_settings.access_token_ttl_seconds,
    )
    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value=new_refresh_token,
        max_age=auth_settings.refresh_token_expire_days * 86_400,
    )


@router.post(
    "/bearer/logout",
    name="auth:bearer.logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_bearer(
    current_user: CurrentActiveUserDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
    bearer_token: Annotated[str | None, Depends(oauth2_scheme)] = None,
    request: RefreshTokenRequest | None = None,
) -> None:
    """Logout a bearer client and revoke its supplied refresh token."""
    if bearer_token:
        await strategy.destroy_token(bearer_token, current_user)

    if request:
        await refresh_token_service.blacklist_token(redis, request.refresh_token.get_secret_value())


@router.post(
    "/session/logout",
    name="auth:session.logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_session(
    response: Response,
    current_user: CurrentActiveUserDep,
    strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
    cookie_refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
    cookie_auth_token: Annotated[str | None, Cookie(alias="auth")] = None,
) -> None:
    """Logout a browser session, revoke refresh state, and clear browser storage."""
    if cookie_auth_token:
        await strategy.destroy_token(cookie_auth_token, current_user)

    # Clear cookies — must pass the same path + domain used at set time,
    # otherwise the browser treats the deletion as a different cookie scope
    # and the original cookie survives logout (RFC 6265).
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA

    if cookie_refresh_token:
        await refresh_token_service.blacklist_token(redis, cookie_refresh_token)


@router.post(
    "/sessions/revoke-all",
    name="auth:sessions.revoke_all",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_all_sessions(
    response: Response,
    current_user: CurrentActiveUserDep,
    redis: OptionalRedisDep,
) -> None:
    """Revoke all refresh tokens for the current user and clear browser session state."""
    await refresh_token_service.revoke_all_user_tokens(redis, current_user.id)
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA
