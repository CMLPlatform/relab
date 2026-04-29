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
from app.api.auth.services.auth_backends import COOKIE_DOMAIN, COOKIE_PATH
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.core.config import settings as core_settings
from app.core.redis import OptionalRedisDep

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

router = APIRouter()


@router.post(
    "/refresh",
    name="auth:bearer.refresh",
    response_model=RefreshTokenResponse,
)
async def refresh_access_token(
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
    request: RefreshTokenRequest | None = None,
    cookie_refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token for bearer auth.

    Validates refresh token and issues new access token.
    Updates session activity timestamp.
    """
    actual_refresh_token = (request.refresh_token.get_secret_value() if request else None) or cookie_refresh_token
    if not actual_refresh_token:
        raise RefreshTokenNotFoundError

    # Verify refresh token
    user_id = await refresh_token_service.verify_refresh_token(redis, actual_refresh_token)

    # Get user
    user = await user_manager.get(user_id)
    if not user or not user.is_active:
        raise RefreshTokenUserInactiveError

    # Generate new access token
    access_token = await strategy.write_token(user)
    new_refresh_token = await refresh_token_service.rotate_refresh_token(redis, actual_refresh_token)

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
    Updates session activity timestamp.
    """
    if not refresh_token:
        raise RefreshTokenNotFoundError

    # Verify token first, then rotate after user validation succeeds.
    user_id = await refresh_token_service.verify_refresh_token(redis, refresh_token)

    # Get user
    user = await user_manager.get(user_id)
    if not user or not user.is_active:
        raise RefreshTokenUserInactiveError

    # Generate new access token and set cookie
    access_token = await strategy.write_token(user)
    new_refresh_token = await refresh_token_service.rotate_refresh_token(redis, refresh_token)
    response.set_cookie(
        key="auth",
        value=access_token,
        max_age=auth_settings.access_token_ttl_seconds,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        httponly=True,
        secure=core_settings.secure_cookies,
        samesite="lax",
    )
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        max_age=auth_settings.refresh_token_expire_days * 86_400,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        httponly=True,
        secure=core_settings.secure_cookies,
        samesite="lax",
    )


@router.post(
    "/logout",
    name="auth:logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    response: Response,
    current_user: CurrentActiveUserDep,
    strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
    cookie_refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
    cookie_auth_token: Annotated[str | None, Cookie(alias="auth")] = None,
    bearer_token: Annotated[str | None, Depends(oauth2_scheme)] = None,
) -> None:
    """Logout the current user.

    Destroys the current access token in Redis and blacklists the refresh token.
    Clears cookies on the client side.
    """
    # 1. Destroy access token
    token = bearer_token or cookie_auth_token
    if token:
        await strategy.destroy_token(token, current_user)

    # 2. Clear cookies — must pass the same path + domain used at set time,
    # otherwise the browser treats the deletion as a different cookie scope
    # and the original cookie survives logout (RFC 6265).
    response.delete_cookie(
        "auth",
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        secure=core_settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        "refresh_token",
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        secure=core_settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )

    # 3. Blacklist refresh token
    if cookie_refresh_token:
        await refresh_token_service.blacklist_token(redis, cookie_refresh_token)
