"""Refresh-token and session lifecycle orchestration."""

from __future__ import annotations

from fastapi import Response
from fastapi_users.authentication import Strategy

from app.api.auth.config import settings as auth_settings
from app.api.auth.exceptions import RefreshTokenUserInactiveError
from app.api.auth.models import User
from app.api.auth.schemas import RefreshTokenResponse
from app.api.auth.services import refresh_token_service
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_browser_auth_cookie,
)
from app.api.auth.services.user_manager import UserManager
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.redis import Redis

SESSION_LOGOUT_CLEAR_SITE_DATA = '"cache", "cookies", "storage"'


async def refresh_tokens_for_active_user(
    user_manager: UserManager,
    strategy: Strategy,
    redis: Redis,
    refresh_token: str,
) -> tuple[str, str]:
    """Rotate an active user's refresh token and issue a new access token."""
    user_id = await refresh_token_service.verify_refresh_token(redis, refresh_token)
    user = await user_manager.get(user_id)
    if not user or not user.is_active:
        raise RefreshTokenUserInactiveError

    new_refresh_token = await refresh_token_service.rotate_refresh_token(redis, refresh_token)
    access_token = await strategy.write_token(user)
    return access_token, new_refresh_token


async def refresh_bearer_tokens(
    *,
    user_manager: UserManager,
    strategy: Strategy,
    redis: Redis,
    refresh_token: str,
) -> RefreshTokenResponse:
    """Return a bearer refresh response after rotating refresh state."""
    access_token, new_refresh_token = await refresh_tokens_for_active_user(
        user_manager,
        strategy,
        redis,
        refresh_token,
    )
    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",  # noqa: S106 # This value is not a secret.
        expires_in=auth_settings.access_token_ttl_seconds,
    )


async def refresh_session_cookies(
    *,
    response: Response,
    user_manager: UserManager,
    strategy: Strategy,
    redis: Redis,
    refresh_token: str,
) -> None:
    """Rotate a browser-session refresh token and set replacement cookies."""
    access_token, new_refresh_token = await refresh_tokens_for_active_user(
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


async def logout_bearer(
    *,
    current_user: User,
    strategy: Strategy,
    redis: Redis,
    bearer_token: str | None,
    refresh_token: str | None,
) -> None:
    """Destroy bearer access state and blacklist the supplied refresh token."""
    if bearer_token:
        await strategy.destroy_token(bearer_token, current_user)
    if refresh_token:
        await refresh_token_service.blacklist_token(redis, refresh_token)
    audit_event(
        current_user.id,
        AuditAction.LOGOUT,
        "auth_session",
        current_user.id,
        context=AuditContext(transport="bearer"),
    )


async def logout_session(
    *,
    response: Response,
    current_user: User,
    strategy: Strategy,
    redis: Redis,
    cookie_refresh_token: str | None,
    cookie_auth_token: str | None,
) -> None:
    """Destroy browser session state, clear cookies, and blacklist refresh state."""
    if cookie_auth_token:
        await strategy.destroy_token(cookie_auth_token, current_user)

    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA

    if cookie_refresh_token:
        await refresh_token_service.blacklist_token(redis, cookie_refresh_token)
    audit_event(
        current_user.id,
        AuditAction.LOGOUT,
        "auth_session",
        current_user.id,
        context=AuditContext(transport="session"),
    )


async def revoke_all_sessions(*, response: Response, current_user: User, redis: Redis) -> None:
    """Revoke all refresh tokens for a user and clear browser session state."""
    await refresh_token_service.revoke_all_user_tokens(redis, current_user.id)
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA
    audit_event(current_user.id, AuditAction.SESSIONS_REVOKED, "auth_session", current_user.id)
