"""Unit tests for authentication utilities."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.auth.schemas import UserCreate
from app.api.auth.utils.email_validation import EmailChecker
from app.api.auth.utils.programmatic_user_crud import create_user
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# Constants for test values
PW_TOO_SHORT = "Too short"
PASSWORD_INVALID_MSG = f"Password is invalid: {PW_TOO_SHORT}"


@pytest.fixture
def mock_redis() -> AsyncMock:
    """Fixture for a mock Redis client."""
    return AsyncMock()


class TestEmailChecker:
    """Tests for the EmailChecker utility."""

    async def test_init_without_redis(self) -> None:
        """Test initialization without Redis client."""
        checker = EmailChecker(redis_client=None)

        with patch("app.api.auth.utils.email_validation.DefaultChecker") as mock_default_checker:
            mock_checker_instance = AsyncMock()
            mock_default_checker.return_value = mock_checker_instance

            await checker.initialize()

            mock_default_checker.assert_called_once()
            assert checker.checker == mock_checker_instance
            mock_checker_instance.init_redis.assert_not_called()
            mock_checker_instance.fetch_temp_email_domains.assert_called_once()

        await checker.close()

    async def test_init_with_redis(self, mock_redis: AsyncMock) -> None:
        """Test initialization with Redis client when domains don't exist in cache."""
        # Mock redis_client.exists to return False (domains not in cache)
        mock_redis.exists = AsyncMock(return_value=False)
        checker = EmailChecker(redis_client=mock_redis)

        with patch("app.api.auth.utils.email_validation.DefaultChecker") as mock_default_checker:
            mock_checker_instance = AsyncMock()
            mock_default_checker.return_value = mock_checker_instance

            await checker.initialize()

            mock_default_checker.assert_called_once()
            assert checker.checker == mock_checker_instance
            # Should check if domains exist in Redis
            mock_redis.exists.assert_called_once_with("temp_domains")
            # Should call init_redis only when domains don't exist
            mock_checker_instance.init_redis.assert_called_once()

        await checker.close()

    async def test_init_with_redis_cached(self, mock_redis: AsyncMock) -> None:
        """Test initialization with Redis client when domains already exist in cache."""
        # Mock redis_client.exists to return True (domains already in cache)
        mock_redis.exists = AsyncMock(return_value=True)
        checker = EmailChecker(redis_client=mock_redis)

        with patch("app.api.auth.utils.email_validation.DefaultChecker") as mock_default_checker:
            mock_checker_instance = AsyncMock()
            mock_default_checker.return_value = mock_checker_instance

            await checker.initialize()

            mock_default_checker.assert_called_once()
            assert checker.checker == mock_checker_instance
            # Should check if domains exist in Redis
            mock_redis.exists.assert_called_once_with("temp_domains")
            # Should NOT call init_redis when domains are already cached
            mock_checker_instance.init_redis.assert_not_called()

        await checker.close()

    async def test_refresh_domains_success(self, mock_redis: AsyncMock) -> None:
        """Test successful domain refresh."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()

        await checker._refresh_domains()  # noqa: SLF001

        checker.checker.fetch_temp_email_domains.assert_called_once()

    async def test_refresh_domains_failure(self, mock_redis: AsyncMock) -> None:
        """Test domain refresh failure handles exceptions gracefully."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.fetch_temp_email_domains.side_effect = RuntimeError("Refresh failed")

        # Should not raise exception
        await checker._refresh_domains()  # noqa: SLF001

        checker.checker.fetch_temp_email_domains.assert_called_once()

    async def test_is_disposable_true(self, mock_redis: AsyncMock) -> None:
        """Test identifying disposable email."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.return_value = True

        result = await checker.is_disposable("test@temp-mail.org")

        assert result is True
        checker.checker.is_disposable.assert_called_with("test@temp-mail.org")

    async def test_is_disposable_false(self, mock_redis: AsyncMock) -> None:
        """Test identifying non-disposable email."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.return_value = False

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_error_fail_open(self, mock_redis: AsyncMock) -> None:
        """Test error handling during check returns False (fail open)."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.side_effect = RedisConnectionError("Redis down")

        # When check fails, we should allow registration (return False)
        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_not_initialized(self, mock_redis: AsyncMock) -> None:
        """Test check when checker is not initialized."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = None

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_close_cancels_task(self, mock_redis: AsyncMock) -> None:
        """Test close cancels the refresh task."""
        checker = EmailChecker(redis_client=mock_redis)

        # Mock the task to be awaitable
        mock_task = asyncio.Future()
        mock_task.set_result(None)
        mock_task.cancel = MagicMock()

        checker._task = mock_task  # noqa: SLF001
        mock_checker = AsyncMock()
        checker.checker = mock_checker

        await checker.close()

        mock_task.cancel.assert_called_once()
        mock_checker.close_connections.assert_called_once()


class TestProgrammaticUserCrud:
    """Tests for programmatic user CRUD operations."""

    @pytest.fixture
    def user_create(self) -> UserCreate:
        """Fixture for UserCreate schema."""
        return UserCreate(email="test@example.com", password="password123")  # noqa: S106

    @pytest.fixture
    def mock_user_manager(self) -> AsyncMock:
        """Fixture for a mock user manager."""
        return AsyncMock()

    @pytest.fixture
    def mock_session(self) -> AsyncMock:
        """Fixture for a mock database session."""
        return AsyncMock()

    async def test_create_user_success(
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test successful user creation."""
        expected_user = UserFactory.build(email=user_create.email, hashed_password="hashed")  # noqa: S106
        mock_user_manager.create.return_value = expected_user

        # Mock the context manager
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.utils.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            user = await create_user(mock_session, user_create, send_registration_email=False)

            assert user == expected_user
            mock_user_manager.create.assert_called_once_with(user_create)

    async def test_create_user_with_email(
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation with verification email."""
        expected_user = UserFactory.build(email=user_create.email, hashed_password="hashed")  # noqa: S106
        mock_user_manager.create.return_value = expected_user
        mock_user_manager.request_verify = AsyncMock()

        # Mock the context manager
        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.utils.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            user = await create_user(mock_session, user_create, send_registration_email=True)

            assert user == expected_user
            mock_user_manager.create.assert_called_once_with(user_create)

            # Verify request_verify was called with user
            mock_user_manager.request_verify.assert_called_once_with(expected_user)

    async def test_create_user_already_exists(
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation when user already exists."""
        mock_user_manager.create.side_effect = UserAlreadyExists()

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.utils.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            with pytest.raises(UserAlreadyExists) as exc:
                await create_user(mock_session, user_create)

            assert f"User with email {user_create.email} already exists" in str(exc.value)

    async def test_create_user_invalid_password(
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
    ) -> None:
        """Test user creation with invalid password."""
        mock_user_manager.create.side_effect = InvalidPasswordException(reason=PW_TOO_SHORT)

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.utils.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            with pytest.raises(InvalidPasswordException) as exc:
                await create_user(mock_session, user_create)

            assert PASSWORD_INVALID_MSG in str(exc.value)
