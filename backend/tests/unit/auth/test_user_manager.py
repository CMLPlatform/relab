"""Unit tests for username/email login resolution in the UserManager service."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.manager import BaseUserManager
from pydantic import SecretStr

from app.api.auth.schemas import UserUpdate
from app.api.auth.services.rate_limiter import RateLimitExceededError
from app.api.auth.services.user_manager import UserManager


def _make_credentials(username: str, password: str = "testpassword") -> OAuth2PasswordRequestForm:  # noqa: S107
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = username
    form.password = password
    return form


def _make_manager(mock_user: MagicMock | None = None) -> tuple[UserManager, AsyncMock]:
    """Return a UserManager with a mocked user_db.session."""
    mock_scalars = MagicMock()
    mock_scalars.unique.return_value.one_or_none.return_value = mock_user

    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user_db = MagicMock()
    mock_user_db.session = mock_session

    manager = UserManager.__new__(UserManager)
    manager.user_db = mock_user_db

    return manager, mock_session


class TestAuthenticateUsernameResolution:
    """UserManager.authenticate resolves usernames to email before delegating to the parent."""

    async def test_applies_account_aware_rate_limit_before_lookup(self) -> None:
        """Login attempts should also be bucketed by a hash of the submitted identifier."""
        manager, mock_session = _make_manager()
        credentials = _make_credentials(" User@Example.COM ")

        with (
            patch("app.api.auth.services.user_manager.limiter", create=True) as mock_limiter,
            patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super,
        ):
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_limiter.hit_key.assert_called_once()
        rate, key = mock_limiter.hit_key.call_args.args
        assert rate == "3/minute"
        assert key.startswith("auth:login:account:")
        assert "user@example.com" not in key
        mock_session.execute.assert_not_called()

    async def test_account_rate_limit_exceeded_skips_lookup(self) -> None:
        """A blocked account bucket should stop work before DB or password checks."""
        manager, mock_session = _make_manager()
        credentials = _make_credentials("blocked@example.com")

        with patch("app.api.auth.services.user_manager.limiter", create=True) as mock_limiter:
            mock_limiter.hit_key.side_effect = RateLimitExceededError
            with pytest.raises(RateLimitExceededError):
                await manager.authenticate(credentials)

        mock_session.execute.assert_not_called()

    async def test_email_input_skips_db_lookup(self) -> None:
        """When credentials contain '@', no DB query is made and the email is passed through unchanged."""
        manager, mock_session = _make_manager()
        credentials = _make_credentials("user@example.com")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_session.execute.assert_not_called()
        mock_super.assert_called_once_with(credentials)
        assert credentials.username == "user@example.com"

    async def test_username_found_replaces_with_email(self) -> None:
        """When a user is found by username, credentials.username is replaced with their email."""
        mock_user = MagicMock()
        mock_user.email = "resolved@example.com"

        manager, mock_session = _make_manager(mock_user=mock_user)
        credentials = _make_credentials("myusername")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = mock_user
            await manager.authenticate(credentials)

        mock_session.execute.assert_called_once()
        assert credentials.username == "resolved@example.com"
        mock_super.assert_called_once_with(credentials)

    async def test_username_not_found_passes_original(self) -> None:
        """When no user matches the username, credentials are passed unchanged to the parent."""
        manager, mock_session = _make_manager(mock_user=None)
        credentials = _make_credentials("nonexistent_user")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_session.execute.assert_called_once()
        assert credentials.username == "nonexistent_user"
        mock_super.assert_called_once_with(credentials)

    async def test_returns_parent_result(self) -> None:
        """Authenticate returns whatever the parent authenticate returns."""
        mock_user = MagicMock()
        mock_user.email = "found@example.com"

        manager, _ = _make_manager(mock_user=mock_user)
        credentials = _make_credentials("someuser")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = mock_user
            result = await manager.authenticate(credentials)

        assert result is mock_user


class TestUserUpdateSchema:
    """UserUpdate keeps reauthentication-only fields out of persistence payloads."""

    def test_current_password_is_not_in_forwarded_update_dicts(self) -> None:
        """The reauthentication-only field must not be persisted onto the User model."""
        update = UserUpdate(email="new@example.com", current_password=SecretStr("current-passphrase-42"))

        assert "current_password" not in update.create_update_dict()
        assert "current_password" not in update.create_update_dict_superuser()


class TestResetPasswordHooks:
    """Post-reset hooks revoke existing sessions and notify the user."""

    async def test_on_after_forgot_password_uses_background_tasks_from_request_state(self) -> None:
        """Reset-link email sending should be queued when the route provides background tasks."""
        manager, _ = _make_manager()
        user = MagicMock()
        user.email = "user@example.com"
        user.username = "user"
        request = MagicMock()
        request.state.background_tasks = MagicMock()

        with patch("app.api.auth.services.user_manager.send_reset_password_email", new_callable=AsyncMock) as mock_send:
            await manager.on_after_forgot_password(user, "reset-token", request)

        mock_send.assert_awaited_once_with("user@example.com", "user", "reset-token", request.state.background_tasks)

    async def test_on_after_reset_password_revokes_refresh_tokens_and_sends_confirmation(self) -> None:
        """Successful password resets should invalidate active sessions and send a confirmation email."""
        manager, _ = _make_manager()
        user = MagicMock()
        user.id = "user-id"
        user.email = "user@example.com"
        user.username = "user"
        request = MagicMock()
        redis = object()

        with (
            patch("app.api.auth.services.user_manager.get_request_services") as mock_services,
            patch(
                "app.api.auth.services.user_manager.refresh_token_service.revoke_all_user_tokens",
                new_callable=AsyncMock,
            ) as mock_revoke,
            patch(
                "app.api.auth.services.user_manager.send_password_reset_confirmation_email",
                new_callable=AsyncMock,
            ) as mock_send,
        ):
            mock_services.return_value.redis = redis
            await manager.on_after_reset_password(user, request)

        mock_revoke.assert_awaited_once_with(redis, "user-id")
        mock_send.assert_awaited_once_with("user@example.com", "user")
