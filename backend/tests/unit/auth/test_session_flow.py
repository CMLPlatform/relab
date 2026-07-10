"""Unit tests for auth session and refresh flow orchestration."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Response
from fastapi_users.exceptions import UserNotExists

from app.api.auth.exceptions import RefreshTokenUserInactiveError
from app.api.auth.schemas import RefreshTokenResponse
from app.api.auth.services import session_flow
from app.api.auth.services.auth_backends import AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME
from app.api.common.audit import AuditAction, AuditContext


async def test_refresh_tokens_for_active_user_rotates_and_writes_access_token() -> None:
    """Refreshing should verify the old token, rotate it, and issue a fresh access token."""
    user = MagicMock()
    user.is_active = True
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)
    strategy = MagicMock()
    strategy.write_token = AsyncMock(return_value="access-token")

    with (
        patch(
            "app.api.auth.services.session_flow.refresh_token_service.verify_refresh_token",
            new=AsyncMock(return_value="user-id"),
        ),
        patch(
            "app.api.auth.services.session_flow.refresh_token_service.rotate_refresh_token",
            new=AsyncMock(return_value="new-refresh"),
        ),
    ):
        access_token, refresh_token = await session_flow.refresh_tokens_for_active_user(
            user_manager,
            strategy,
            MagicMock(),
            "old-refresh",
        )

    assert access_token == "access-token"
    assert refresh_token == "new-refresh"


async def test_refresh_tokens_for_active_user_rejects_deleted_user_and_revokes_token() -> None:
    """A refresh token for a hard-deleted user should be rejected (401) and revoked, not crash."""
    user_manager = MagicMock()
    user_manager.get = AsyncMock(side_effect=UserNotExists)
    strategy = MagicMock()
    redis = MagicMock()

    with (
        patch(
            "app.api.auth.services.session_flow.refresh_token_service.verify_refresh_token",
            new=AsyncMock(return_value="user-id"),
        ),
        patch(
            "app.api.auth.services.session_flow.refresh_token_service.blacklist_token",
            new=AsyncMock(),
        ) as blacklist,
        pytest.raises(RefreshTokenUserInactiveError),
    ):
        await session_flow.refresh_tokens_for_active_user(
            user_manager,
            strategy,
            redis,
            "old-refresh",
        )

    # The presented token itself must be the one revoked, not some other value.
    blacklist.assert_awaited_once_with(redis, "old-refresh")


async def test_refresh_bearer_tokens_returns_public_token_response() -> None:
    """Bearer refresh should return the existing public response schema."""
    with patch(
        "app.api.auth.services.session_flow.refresh_tokens_for_active_user",
        new=AsyncMock(return_value=("access-token", "new-refresh")),
    ):
        result = await session_flow.refresh_bearer_tokens(
            user_manager=MagicMock(),
            strategy=MagicMock(),
            redis=MagicMock(),
            refresh_token="old-refresh",
        )

    assert isinstance(result, RefreshTokenResponse)
    assert result.access_token == "access-token"
    assert result.refresh_token == "new-refresh"
    assert result.token_type == "bearer"


async def test_logout_session_clears_cookies_storage_and_audits() -> None:
    """Session logout should clear browser state, blacklist refresh state, and audit logout."""
    user = MagicMock()
    user.id = "user-id"
    strategy = MagicMock()
    strategy.destroy_token = AsyncMock()
    response = Response()
    redis = MagicMock()

    with (
        patch("app.api.auth.services.session_flow.refresh_token_service.blacklist_token", new=AsyncMock()) as blacklist,
        patch("app.api.auth.services.session_flow.audit_event") as audit_event,
    ):
        await session_flow.logout_session(
            response=response,
            current_user=user,
            strategy=strategy,
            redis=redis,
            cookie_refresh_token="refresh-token",
            cookie_auth_token="auth-token",
        )

    strategy.destroy_token.assert_awaited_once_with("auth-token", user)
    # The refresh token — not the access token — is what must be blacklisted on logout.
    blacklist.assert_awaited_once_with(redis, "refresh-token")
    assert response.headers["Clear-Site-Data"] == session_flow.SESSION_LOGOUT_CLEAR_SITE_DATA
    assert any(header.startswith(f"{AUTH_COOKIE_NAME}=") for header in response.headers.getlist("set-cookie"))
    assert any(header.startswith(f"{REFRESH_COOKIE_NAME}=") for header in response.headers.getlist("set-cookie"))
    audit_event.assert_called_once_with(
        user.id,
        AuditAction.LOGOUT,
        "auth_session",
        user.id,
        context=AuditContext(transport="session"),
    )


async def test_revoke_all_sessions_revokes_clears_and_audits() -> None:
    """Revoke-all should invalidate refresh tokens and clear browser state."""
    user = MagicMock()
    user.id = "user-id"
    response = Response()
    redis = MagicMock()

    with (
        patch(
            "app.api.auth.services.session_flow.refresh_token_service.revoke_all_user_tokens",
            new=AsyncMock(),
        ) as revoke_all,
        patch("app.api.auth.services.session_flow.audit_event") as audit_event,
    ):
        await session_flow.revoke_all_sessions(response=response, current_user=user, redis=redis)

    revoke_all.assert_awaited_once_with(redis, user.id)
    assert response.headers["Clear-Site-Data"] == session_flow.SESSION_LOGOUT_CLEAR_SITE_DATA
    audit_event.assert_called_once_with(user.id, AuditAction.SESSIONS_REVOKED, "auth_session", user.id)
