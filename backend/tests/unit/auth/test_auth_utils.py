import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.utils.email_validation import EmailChecker
from app.api.auth.utils.programmatic_user_crud import create_user


@pytest.fixture
def mock_redis():
    return AsyncMock()


class TestEmailChecker:
    async def test_init_without_redis(self):
        """Test initialization without Redis client."""
        checker = EmailChecker(redis_client=None)

        with patch("app.api.auth.utils.email_validation.DefaultChecker") as MockDefaultChecker:
            mock_checker_instance = AsyncMock()
            MockDefaultChecker.return_value = mock_checker_instance

            await checker.initialize()

            MockDefaultChecker.assert_called_once()
            assert checker.checker == mock_checker_instance
            mock_checker_instance.init_redis.assert_not_called()
            mock_checker_instance.fetch_temp_email_domains.assert_called_once()

        await checker.close()

    async def test_init_with_redis(self, mock_redis):
        """Test initialization with Redis client."""
        checker = EmailChecker(redis_client=mock_redis)

        with patch("app.api.auth.utils.email_validation.DefaultChecker") as MockDefaultChecker:
            mock_checker_instance = AsyncMock()
            MockDefaultChecker.return_value = mock_checker_instance

            await checker.initialize()

            MockDefaultChecker.assert_called_once()
            assert checker.checker == mock_checker_instance
            mock_checker_instance.init_redis.assert_called_once()
            mock_checker_instance.fetch_temp_email_domains.assert_called_once()

        await checker.close()

    async def test_refresh_domains_success(self, mock_redis):
        """Test successful domain refresh."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()

        await checker._refresh_domains()

        checker.checker.fetch_temp_email_domains.assert_called_once()

    async def test_refresh_domains_failure(self, mock_redis):
        """Test domain refresh failure handles exceptions gracefully."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.fetch_temp_email_domains.side_effect = RuntimeError("Refresh failed")

        # Should not raise exception
        await checker._refresh_domains()

        checker.checker.fetch_temp_email_domains.assert_called_once()

    async def test_is_disposable_true(self, mock_redis):
        """Test identifying disposable email."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.return_value = True

        result = await checker.is_disposable("test@temp-mail.org")

        assert result is True
        checker.checker.is_disposable.assert_called_with("test@temp-mail.org")

    async def test_is_disposable_false(self, mock_redis):
        """Test identifying non-disposable email."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.return_value = False

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_error_fail_open(self, mock_redis):
        """Test error handling during check returns False (fail open)."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = AsyncMock()
        checker.checker.is_disposable.side_effect = RedisConnectionError("Redis down")

        # When check fails, we should allow registration (return False)
        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_is_disposable_not_initialized(self, mock_redis):
        """Test check when checker is not initialized."""
        checker = EmailChecker(redis_client=mock_redis)
        checker.checker = None

        result = await checker.is_disposable("user@example.com")

        assert result is False

    async def test_close_cancels_task(self, mock_redis):
        """Test close cancels the refresh task."""
        checker = EmailChecker(redis_client=mock_redis)

        # Mock the task to be awaitable
        # Create a Future and verify it works when awaited
        mock_task = asyncio.Future()
        mock_task.set_result(None)  # It needs a result if awaited
        mock_task.cancel = MagicMock()

        checker._refresh_task = mock_task
        mock_checker = AsyncMock()
        checker.checker = mock_checker

        await checker.close()

        mock_task.cancel.assert_called_once()
        mock_checker.close_connections.assert_called_once()


class TestProgrammaticUserCrud:
    @pytest.fixture
    def user_create(self):
        return UserCreate(email="test@example.com", password="password123")

    @pytest.fixture
    def mock_user_manager(self):
        return AsyncMock()

    @pytest.fixture
    def mock_session(self):
        return AsyncMock()

    async def test_create_user_success(self, mock_session, user_create, mock_user_manager):
        """Test successful user creation."""
        expected_user = User(id="uid", email=user_create.email)
        mock_user_manager.create.return_value = expected_user

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
            mock_user_manager.create.assert_called_once()

            # Verify request state was set
            call_kwargs = mock_user_manager.create.call_args.kwargs
            assert "request" in call_kwargs
            request = call_kwargs["request"]
            assert isinstance(request, Request)
            assert request.state.send_registration_email is True

    async def test_create_user_already_exists(self, mock_session, user_create, mock_user_manager):
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

    async def test_create_user_invalid_password(self, mock_session, user_create, mock_user_manager):
        """Test user creation with invalid password."""
        mock_user_manager.create.side_effect = InvalidPasswordException(reason="Too short")

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_user_manager
        mock_context.__aexit__.return_value = None

        with patch(
            "app.api.auth.utils.programmatic_user_crud.get_chained_async_user_manager_context",
            return_value=mock_context,
        ):
            with pytest.raises(InvalidPasswordException) as exc:
                await create_user(mock_session, user_create)

            assert "Password is invalid: Too short" in str(exc.value)
