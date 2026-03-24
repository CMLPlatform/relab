"""Unit tests for username/email login resolution in the UserManager service."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.manager import BaseUserManager

from app.api.auth.services.user_manager import UserManager


def _make_credentials(username: str, password: str = "testpassword") -> OAuth2PasswordRequestForm:  # noqa: S107
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = username
    form.password = password
    return form


def _make_manager(mock_user: MagicMock | None = None) -> tuple[UserManager, AsyncMock]:
    """Return a UserManager with a mocked user_db.session."""
    mock_result = MagicMock()
    mock_result.unique.return_value.one_or_none.return_value = mock_user

    mock_session = MagicMock()
    mock_session.exec = AsyncMock(return_value=mock_result)

    mock_user_db = MagicMock()
    mock_user_db.session = mock_session

    manager = UserManager.__new__(UserManager)
    manager.user_db = mock_user_db

    return manager, mock_session


class TestAuthenticateUsernameResolution:
    """UserManager.authenticate resolves usernames to email before delegating to the parent."""

    async def test_email_input_skips_db_lookup(self) -> None:
        """When credentials contain '@', no DB query is made and the email is passed through unchanged."""
        manager, mock_session = _make_manager()
        credentials = _make_credentials("user@example.com")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_session.exec.assert_not_called()
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

        mock_session.exec.assert_called_once()
        assert credentials.username == "resolved@example.com"
        mock_super.assert_called_once_with(credentials)

    async def test_username_not_found_passes_original(self) -> None:
        """When no user matches the username, credentials are passed unchanged to the parent."""
        manager, mock_session = _make_manager(mock_user=None)
        credentials = _make_credentials("nonexistent_user")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_session.exec.assert_called_once()
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

    async def test_at_sign_in_username_skips_lookup(self) -> None:
        """An input containing '@' goes straight to the parent.

        We use a valid email here to satisfy Pydantic's EmailStr validation.
        """
        manager, mock_session = _make_manager()
        credentials = _make_credentials("user@example.com")

        with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
            mock_super.return_value = None
            await manager.authenticate(credentials)

        mock_session.exec.assert_not_called()
        assert credentials.username == "user@example.com"
