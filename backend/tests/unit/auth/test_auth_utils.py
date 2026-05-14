"""Unit tests for authentication utilities."""
# Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.schemas import TrustedUserCreate
from app.api.auth.services.programmatic_user_crud import create_user
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# Constants for test values
PW_TOO_SHORT = "Too short"
PASSWORD_INVALID_MSG = f"Password is invalid: {PW_TOO_SHORT}"


class TestProgrammaticUserCrud:
    """Tests for programmatic user CRUD operations."""

    @pytest.fixture
    def user_create(self) -> TrustedUserCreate:
        """Fixture for trusted user creation schema."""
        return TrustedUserCreate(email="test@example.com", password="correct-horse-battery-staple-v42")

    @pytest.fixture
    def mock_user_manager(self) -> AsyncMock:
        """Fixture for a mock user manager."""
        return AsyncMock()

    async def test_create_user_success(
        self, mock_session: AsyncSession, user_create: TrustedUserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test successful user creation."""
        expected_user = UserFactory.build(email=user_create.email, hashed_password="hashed")
        mock_user_manager.create.return_value = expected_user

        # Mock the context manager
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.services.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            user = await create_user(mock_session, user_create, send_registration_email=False)

            assert user == expected_user
            mock_user_manager.create.assert_called_once_with(user_create)

    async def test_create_user_with_email(
        self, mock_session: AsyncSession, user_create: TrustedUserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation with verification email."""
        expected_user = UserFactory.build(email=user_create.email, hashed_password="hashed")
        mock_user_manager.create.return_value = expected_user
        mock_user_manager.request_verify = AsyncMock()

        # Mock the context manager
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.services.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            user = await create_user(mock_session, user_create, send_registration_email=True)

            assert user == expected_user
            mock_user_manager.create.assert_called_once_with(user_create)

            # Verify request_verify was called with user
            mock_user_manager.request_verify.assert_called_once_with(expected_user)

    async def test_create_user_can_skip_breach_check(
        self, mock_session: AsyncSession, user_create: TrustedUserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Programmatic bootstrap flows can disable the network breach check."""
        expected_user = UserFactory.build(email=user_create.email, hashed_password="hashed")
        mock_user_manager.create.return_value = expected_user

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.services.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            user = await create_user(mock_session, user_create, skip_breach_check=True)

            assert user == expected_user
            assert mock_user_manager.skip_breach_check is True
            mock_user_manager.create.assert_called_once_with(user_create)

    async def test_create_user_already_exists(
        self, mock_session: AsyncSession, user_create: TrustedUserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation when user already exists."""
        mock_user_manager.create.side_effect = UserAlreadyExists()

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.services.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            with pytest.raises(UserAlreadyExists) as exc:
                await create_user(mock_session, user_create)

            assert f"User with email {user_create.email} already exists" in str(exc.value)

    async def test_create_user_invalid_password(
        self, mock_session: AsyncSession, user_create: TrustedUserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation with invalid password."""
        mock_user_manager.create.side_effect = InvalidPasswordException(reason=PW_TOO_SHORT)

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.services.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            with pytest.raises(InvalidPasswordException) as exc:
                await create_user(mock_session, user_create)

            assert PASSWORD_INVALID_MSG in str(exc.value)
