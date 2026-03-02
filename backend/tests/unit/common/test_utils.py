"""Unit tests for common utilities.

Tests utilities, helpers, and common functions (no database required).
Demonstrates pytest-mock usage for mocking external dependencies.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Never

import pytest

from app.api.common.exceptions import APIError

if TYPE_CHECKING:
    from pytest_mock import MockerFixture

# Constants for test values to avoid magic value warnings
TEST_ERROR = "Test error"
VAL_FAILED = "Validation failed"
EMAIL_INVALID = "Field 'email' is invalid"
INTERNAL_ERROR = "Internal error"
RESOURCE_NOT_FOUND = "Resource not found"
HTTP_NOT_FOUND = 404
HTTP_INTERNAL_ERROR = 500
MOCKED_VAL = "mocked"
ORIGINAL_VAL = "original"
ASYNC_RESULT = "async result"
ASYNC_ERROR = "Async error"
MOCKED_RESOURCE = "mocked_resource"
TEST_NAME = "Test"


@pytest.mark.unit
class TestAPIError:
    """Test custom API error exception."""

    def test_api_error_creation_message_only(self) -> None:
        """Test creating APIError with just a message."""
        error = APIError(message=TEST_ERROR)

        assert error.message == TEST_ERROR
        assert error.details is None
        assert str(error) == TEST_ERROR

    def test_api_error_creation_with_details(self) -> None:
        """Test creating APIError with message and details."""
        error = APIError(
            message=VAL_FAILED,
            details=EMAIL_INVALID,
        )

        assert error.message == VAL_FAILED
        assert error.details == EMAIL_INVALID

    def test_api_error_default_status_code(self) -> None:
        """Test default HTTP status code is 500."""
        error = APIError(message=INTERNAL_ERROR)
        assert error.http_status_code == HTTP_INTERNAL_ERROR

    def test_api_error_inheritable(self) -> None:
        """Test that APIError can be subclassed with custom status codes."""

        class NotFoundError(APIError):
            http_status_code = HTTP_NOT_FOUND

        error = NotFoundError(message=RESOURCE_NOT_FOUND)
        assert error.http_status_code == HTTP_NOT_FOUND

    def test_api_error_is_exception(self) -> Never:
        """Test that APIError is a proper Exception subclass."""
        error = APIError(message="Test")
        assert isinstance(error, Exception)

        with pytest.raises(APIError):
            raise error


@pytest.mark.unit
class TestMockingExamples:
    """Demonstrate pytest-mock usage for testing patterns."""

    def test_mock_simple_function(self, mocker: MockerFixture) -> None:
        """Example: Mock a simple function."""
        # Create a mock object
        mock_func = mocker.MagicMock(return_value=42)

        # Call the mock
        result = mock_func(1, 2, 3)

        # Assertions
        assert result == 42
        mock_func.assert_called_once_with(1, 2, 3)

    def test_mock_function_side_effects(self, mocker: MockerFixture) -> None:
        """Example: Mock with side effects (exceptions, sequences)."""
        # Mock that raises an exception
        mock_func = mocker.MagicMock(side_effect=ValueError("Invalid value"))

        with pytest.raises(ValueError, match="Invalid value"):
            mock_func()

    def test_mock_function_call_count(self, mocker: MockerFixture) -> None:
        """Example: Verify mock was called specific number of times."""
        mock_func = mocker.MagicMock()

        # Call multiple times
        mock_func()
        mock_func()
        mock_func()

        # Verify call count
        assert mock_func.call_count == 3

    def test_patch_module_import(self, mocker: MockerFixture) -> None:
        """Example: Patch imports to simulate external dependencies."""
        # Mock an external module
        mock_module = mocker.MagicMock()
        mocker.patch.dict("sys.modules", {"fake_module": mock_module})

        # Now code importing fake_module would get the mock
        assert mock_module is not None

    def test_patch_class_method(self, mocker: MockerFixture) -> None:
        """Example: Patch a method on a class."""

        class MyClass:
            def method(self) -> str:
                return ORIGINAL_VAL

        obj = MyClass()
        original_result = obj.method()
        assert original_result == ORIGINAL_VAL

        # Patch the method
        mocker.patch.object(MyClass, "method", return_value=MOCKED_VAL)
        obj2 = MyClass()
        assert obj2.method() == MOCKED_VAL

    def test_spy_function_call(self, mocker: MockerFixture) -> None:
        """Example: Spy on function calls (wrap without replacing)."""

        class ForSpying:
            def method(self, x: int) -> int:
                return x * 2

        obj = ForSpying()
        spy = mocker.spy(obj, "method")

        result = obj.method(10)

        assert result == 20
        spy.assert_called_once_with(10)


@pytest.mark.unit
class TestValidationPatterns:
    """Test examples for validation logic that doesn't require database."""

    def test_string_length_validation(self) -> None:
        """Example: Test string length validation."""

        def validate_name(name: str, min_length: int = 1, max_length: int = 255) -> str:
            """Validate name length."""
            if not name or len(name) < min_length:
                err_msg = f"Name must be at least {min_length} character(s)"
                raise ValueError(err_msg)
            if len(name) > max_length:
                err_msg = f"Name cannot exceed {max_length} characters"
                raise ValueError(err_msg)
            return name

        # Happy path
        assert validate_name(TEST_NAME) == TEST_NAME

        # Error cases
        with pytest.raises(ValueError, match="must be at least"):
            validate_name("")

        with pytest.raises(ValueError, match="cannot exceed"):
            validate_name("a" * 300)

    def test_enum_validation(self) -> None:
        """Example: Test enum validation."""

        class Status(StrEnum):
            ACTIVE = "active"
            INACTIVE = "inactive"
            PENDING = "pending"

        def validate_status(status: str) -> Status:
            """Validate and return Status enum."""
            try:
                return Status(status)
            except ValueError as err:
                err_msg = f"Invalid status: {status}"
                raise ValueError(err_msg) from err

        # Happy path
        assert validate_status("active") == Status.ACTIVE

        # Error case
        with pytest.raises(ValueError, match="Invalid status"):
            validate_status("invalid")

    def test_type_validation(self) -> None:
        """Example: Test type validation."""

        def validate_port(port: int | str) -> int:
            """Validate port number."""
            if not isinstance(port, int):
                err_msg = f"Port must be int, got {type(port).__name__}"
                raise TypeError(err_msg)
            if not 1 <= port <= 65535:
                err_msg = f"Port must be 1-65535, got {port}"
                raise ValueError(err_msg)
            return port

        # Happy path
        assert validate_port(8000) == 8000

        # Type error
        with pytest.raises(TypeError):
            validate_port("8000")

        # Value error
        with pytest.raises(ValueError, match="Port must be 1-65535"):
            validate_port(99999)


@pytest.mark.unit
class TestAsyncUtilityPatterns:
    """Examples of testing async utilities with pytest-mock."""

    @pytest.mark.asyncio
    async def test_async_mock_example(self, mocker: MockerFixture) -> None:
        """Example: Mock async functions."""
        # Create an async mock
        mock_async_func = mocker.AsyncMock(return_value=ASYNC_RESULT)

        # Call it
        result = await mock_async_func()

        # Verify
        assert result == ASYNC_RESULT
        mock_async_func.assert_called_once()

    @pytest.mark.asyncio
    async def test_async_mock_with_side_effect(self, mocker: MockerFixture) -> None:
        """Example: Async mock that raises exceptions."""
        # Create async mock that raises
        mock_func = mocker.AsyncMock(side_effect=RuntimeError(ASYNC_ERROR))

        # Verify it raises
        with pytest.raises(RuntimeError, match=ASYNC_ERROR):
            await mock_func()

    @pytest.mark.asyncio
    async def test_async_context_manager_mock(self, mocker: MockerFixture) -> None:
        """Example: Mock async context managers."""

        class AsyncResource:
            async def __aenter__(self):
                return "resource"

            async def __aexit__(self, *args: object) -> None:
                pass

        # Create mock context manager
        mock_resource = mocker.MagicMock()
        mock_resource.__aenter__ = mocker.AsyncMock(return_value=MOCKED_RESOURCE)
        mock_resource.__aexit__ = mocker.AsyncMock(return_value=None)

        # Use it
        async with mock_resource as resource:
            assert resource == MOCKED_RESOURCE

        mock_resource.__aenter__.assert_called_once()
