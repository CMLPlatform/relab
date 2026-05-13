"""Helpers for completing authentication after MFA."""

from fastapi import Response, status
from fastapi_users.authentication import Strategy

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import User
from app.api.auth.schemas import MfaPendingResponse, RefreshTokenResponse
from app.api.auth.services import mfa_service, refresh_token_service
from app.api.auth.services.auth_backends import AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, set_browser_auth_cookie
from app.api.auth.services.user_manager import UserManager
from app.core.redis import OptionalRedisDep


async def create_mfa_pending_response(
    redis: OptionalRedisDep,
    user: User,
    transport: mfa_service.MfaTransport,
) -> MfaPendingResponse:
    """Create the public response used after first-factor authentication."""
    token = await mfa_service.create_login_challenge(redis, user_id=user.id, transport=transport)
    return MfaPendingResponse(mfa_token=token)


async def create_oauth_mfa_handoff(redis: OptionalRedisDep, pending: MfaPendingResponse) -> str:
    """Create a one-time OAuth redirect handoff for pending MFA state."""
    return await mfa_service.create_oauth_handoff(
        redis,
        mfa_token=pending.mfa_token,
    )


async def issue_session_login_response(
    *,
    response: Response,
    user: User,
    user_manager: UserManager,
    redis: OptionalRedisDep,
    cookie_strategy: Strategy,
) -> None:
    """Issue session cookies after all authentication factors succeed."""
    access_token = await cookie_strategy.write_token(user)
    refresh_token = await refresh_token_service.create_refresh_token(redis, user.id)
    set_browser_auth_cookie(
        response,
        key=AUTH_COOKIE_NAME,
        value=access_token,
        max_age=auth_settings.access_token_ttl_seconds,
    )
    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=auth_settings.refresh_token_expire_days * 86_400,
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    await user_manager.on_after_login(user, None, response)


async def issue_bearer_login_response(
    *,
    user: User,
    user_manager: UserManager,
    redis: OptionalRedisDep,
    bearer_strategy: Strategy,
) -> RefreshTokenResponse:
    """Issue bearer tokens after all authentication factors succeed."""
    access_token = await bearer_strategy.write_token(user)
    refresh_token = await refresh_token_service.create_refresh_token(redis, user.id)
    await user_manager.on_after_login(user, None, None)
    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",  # noqa: S106 # This value is not a secret.
        expires_in=auth_settings.access_token_ttl_seconds,
    )
