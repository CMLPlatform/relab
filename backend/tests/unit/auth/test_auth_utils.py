"""Unit tests for authentication utilities."""
# spell-checker: ignore hget, hset, mailinator
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.auth.schemas import UserCreate
from app.api.auth.services.email_checker import EmailChecker, load_local_disposable_domains
from app.api.auth.services.programmatic_user_crud import create_user
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from pathlib import Path

    from sqlalchemy.ext.asyncio import AsyncSession

# Constants for test values
PW_TOO_SHORT = "Too short"
PASSWORD_INVALID_MSG = f"Password is invalid: {PW_TOO_SHORT}"


# Allow private method access for testing purposes
@pytest.fixture
def mock_redis() -> AsyncMock:
    """Fixture for a mock Redis client."""
    return AsyncMock()


class TestEmailChecker:
    """Tests for the EmailChecker utility."""

    async def test_init_without_redis(self) -> None:
        """Test initialization without Redis client."""
        checker = EmailChecker(redis_client=None)

        with patch(
            "app.api.auth.services.email_checker.load_local_disposable_domains",
            return_value={"temp-mail.org"},
        ):
            await checker.initialize()

            assert checker._initialized is True
            assert checker._domains == {"temp-mail.org"}

        await checker.close()

    async def test_init_with_redis(self, mock_redis: AsyncMock) -> None:
        """Test initialization with Redis client when domains don't exist in cache."""
        mock_redis.exists = AsyncMock(return_value=False)
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipe)
        checker = EmailChecker(redis_client=mock_redis)

        with patch(
            "app.api.auth.services.email_checker.load_local_disposable_domains",
            return_value={"mailinator.com", "temp-mail.org"},
        ):
            await checker.initialize()

            assert checker._initialized is True
            mock_redis.exists.assert_called_once_with("temp_domains")
            mock_pipe.delete.assert_called_once()
            mock_pipe.hset.assert_called_once()

        await checker.close()

    async def test_init_with_redis_cached(self, mock_redis: AsyncMock) -> None:
        """Test initialization with Redis client when domains already exist in cache."""
        mock_redis.exists = AsyncMock(return_value=True)
        checker = EmailChecker(redis_client=mock_redis)

        with patch(
            "app.api.auth.services.email_checker.load_local_disposable_domains",
            return_value={"temp-mail.org"},
        ):
            await checker.initialize()

            assert checker._initialized is True
            mock_redis.exists.assert_called_once_with("temp_domains")
            mock_redis.hset.assert_not_awaited()

        await checker.close()

    async def test_refresh_domains_success(self) -> None:
        """Test successful domain refresh."""
        checker = EmailChecker(redis_client=None)
        checker._initialized = True

        with patch.object(
            checker,
            "_fetch_remote_domains",
            AsyncMock(return_value={"mailinator.com", "temp-mail.org"}),
        ):
            await checker.run_once()

        assert checker._domains == {"mailinator.com", "temp-mail.org"}

    async def test_refresh_domains_failure(self, mock_redis: AsyncMock) -> None:
        """Test domain refresh failure handles exceptions gracefully."""
        checker = EmailChecker(redis_client=mock_redis)
        checker._initialized = True

        with patch.object(checker, "_fetch_remote_domains", AsyncMock(side_effect=RuntimeError("Refresh failed"))):
            await checker.run_once()

        mock_redis.hset.assert_not_awaited()

    def test_load_local_disposable_domains(self, tmp_path: Path) -> None:
        """Local fallback files should ignore comments and blank lines."""
        domains_file = tmp_path / "domains.txt"
        domains_file.write_text("# comment\nTemp-Mail.org\n\nmailinator.com\n", encoding="utf-8")

        assert load_local_disposable_domains(domains_file) == {"mailinator.com", "temp-mail.org"}

    async def test_is_disposable_true(self) -> None:
        """Test identifying disposable email."""
        checker = EmailChecker(redis_client=None)
        checker._initialized = True
        checker._domains = {"temp-mail.org"}

        result = await checker.is_disposable("test@temp-mail.org")

        assert result is True

    async def test_is_disposable_false(self) -> None:
        """Test identifying non-disposable email."""
        checker = EmailChecker(redis_client=None)
        checker._initialized = True
        checker._domains = {"temp-mail.org"}

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_redis(self, mock_redis: AsyncMock) -> None:
        """Test disposable check via Redis."""
        mock_redis.hget = AsyncMock(return_value=b"1")
        checker = EmailChecker(redis_client=mock_redis)
        checker._initialized = True

        result = await checker.is_disposable("test@temp-mail.org")

        assert result is True
        mock_redis.hget.assert_awaited_once_with("temp_domains", "temp-mail.org")

    async def test_is_disposable_error_fail_open(self, mock_redis: AsyncMock) -> None:
        """Test error handling during check returns False (fail open)."""
        mock_redis.hget = AsyncMock(side_effect=RedisConnectionError("Redis down"))
        checker = EmailChecker(redis_client=mock_redis)
        checker._initialized = True

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_not_initialized(self) -> None:
        """Test check when checker is not initialized."""
        checker = EmailChecker(redis_client=None)

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_close_cancels_task(self) -> None:
        """Test close cancels the refresh task."""
        checker = EmailChecker(redis_client=None)
        checker._initialized = True

        mock_task = cast("Any", asyncio.Future())
        mock_task.set_result(None)
        mock_task.cancel = MagicMock()

        checker._task = mock_task

        await checker.close()

        mock_task.cancel.assert_called_once()
        assert checker._initialized is False


class TestProgrammaticUserCrud:
    """Tests for programmatic user CRUD operations."""

    @pytest.fixture
    def user_create(self) -> UserCreate:
        """Fixture for UserCreate schema."""
        return UserCreate(email="test@example.com", password="correct-horse-battery-staple-v42")

    @pytest.fixture
    def mock_user_manager(self) -> AsyncMock:
        """Fixture for a mock user manager."""
        return AsyncMock()

    async def test_create_user_success(
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
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
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
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
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
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
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
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
        self, mock_session: AsyncSession, user_create: UserCreate, mock_user_manager: AsyncMock
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
