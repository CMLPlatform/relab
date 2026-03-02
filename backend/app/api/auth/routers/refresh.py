"""Refresh token and multi-device session management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi_users.authentication import Strategy

from app.api.auth.config import settings as auth_settings
from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.schemas import (
    LogoutAllRequest,
    LogoutAllResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
)
from app.api.auth.services import refresh_token_service, session_service
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend
from app.core.config import settings as core_settings
from app.core.redis import RedisDep

router = APIRouter()


@router.post(
    "/refresh",
    name="auth:bearer.refresh",
    response_model=RefreshTokenResponse,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh_access_token(
    request: RefreshTokenRequest,
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: RedisDep,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token for bearer auth.

    Validates refresh token and issues new access token.
    Updates session activity timestamp.
    """
    # Verify refresh token
    token_data = await refresh_token_service.verify_refresh_token(redis, request.refresh_token)

    # Get user
    user = await user_manager.get(token_data["user_id"])
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Update session activity
    await session_service.update_session_activity(redis, token_data["session_id"], user.id)

    # Generate new access token
    access_token = await strategy.write_token(user)

    return RefreshTokenResponse(
        access_token=access_token,
        token_type="bearer",  # noqa: S106
        expires_in=auth_settings.access_token_ttl_seconds,
    )


@router.post(
    "/cookie/refresh",
    name="auth:cookie.refresh",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Successfully refreshed"},
        status.HTTP_401_UNAUTHORIZED: {"description": "Invalid or expired refresh token"},
    },
    status_code=status.HTTP_204_NO_CONTENT,
)
async def refresh_access_token_cookie(
    response: Response,
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
    redis: RedisDep,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    """Refresh access token using refresh token from cookie.

    Validates refresh token cookie and issues new access token cookie.
    Updates session activity timestamp.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found",
        )

    # Verify refresh token
    token_data = await refresh_token_service.verify_refresh_token(redis, refresh_token)

    # Get user
    user = await user_manager.get(token_data["user_id"])
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Update session activity
    await session_service.update_session_activity(redis, token_data["session_id"], user.id)

    # Generate new access token and set cookie
    access_token = await strategy.write_token(user)
    response.set_cookie(
        key="auth",
        value=access_token,
        max_age=auth_settings.access_token_ttl_seconds,
        httponly=True,
        secure=not core_settings.debug,
        samesite="lax",
    )


@router.post(
    "/logout-all",
    name="auth:logout_all",
    response_model=LogoutAllResponse,
)
async def logout_all_devices(
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
    request_body: LogoutAllRequest | None = None,
    cookie_refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
    *,
    except_current: bool = True,
) -> LogoutAllResponse:
    """Logout from all devices.

    Revokes all sessions and blacklists all refresh tokens.
    Optionally keeps current session active.
    """
    actual_refresh_token = (request_body.refresh_token if request_body else None) or cookie_refresh_token

    current_session_id = None

    if except_current and actual_refresh_token:
        try:
            token_data = await refresh_token_service.verify_refresh_token(redis, actual_refresh_token)
            current_session_id = token_data["session_id"]
        except HTTPException:
            # Current token invalid, revoke all
            pass

    # Revoke all sessions
    revoked_count = await session_service.revoke_all_sessions(
        redis,
        current_user.id,
        except_current=current_session_id,
    )

    return LogoutAllResponse(
        message=f"Successfully logged out from {revoked_count} device(s)",
        sessions_revoked=revoked_count,
    )
