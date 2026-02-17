"""Unit tests for common utilities.

Tests utilities, helpers, and common functions (no database required).
Demonstrates pytest-mock usage for mocking external dependencies.
"""

import pytest

from app.api.common.exceptions import APIError


@pytest.mark.unit
class TestAPIError:
    """Test custom API error exception."""

    def test_api_error_creation_message_only(self):
        """Test creating APIError with just a message."""
        error = APIError(message="Test error")

        assert error.message == "Test error"
        assert error.details is None
        assert str(error) == "Test error"

    def test_api_error_creation_with_details(self):
        """Test creating APIError with message and details."""
        error = APIError(
            message="Validation failed",
            details="Field 'email' is invalid",
        )

        assert error.message == "Validation failed"
        assert error.details == "Field 'email' is invalid"

    def test_api_error_default_status_code(self):
        """Test default HTTP status code is 500."""
        error = APIError(message="Internal error")
        assert error.http_status_code == 500

    def test_api_error_inheritable(self):
        """Test that APIError can be subclassed with custom status codes."""

        class NotFoundError(APIError):
            http_status_code = 404

        error = NotFoundError(message="Resource not found")
        assert error.http_status_code == 404

    def test_api_error_is_exception(self):
        """Test that APIError is a proper Exception subclass."""
        error = APIError(message="Test")
        assert isinstance(error, Exception)

        with pytest.raises(APIError):
            raise error


@pytest.mark.unit
class TestMockingExamples:
    """Demonstrate pytest-mock usage for testing patterns."""

    def test_mock_simple_function(self, mocker):
        """Example: Mock a simple function."""
        # Create a mock object
        mock_func = mocker.MagicMock(return_value=42)

        # Call the mock
        result = mock_func(1, 2, 3)

        # Assertions
        assert result == 42
        mock_func.assert_called_once_with(1, 2, 3)

    def test_mock_function_side_effects(self, mocker):
        """Example: Mock with side effects (exceptions, sequences)."""
        # Mock that raises an exception
        mock_func = mocker.MagicMock(side_effect=ValueError("Invalid value"))

        with pytest.raises(ValueError, match="Invalid value"):
            mock_func()

    def test_mock_function_call_count(self, mocker):
        """Example: Verify mock was called specific number of times."""
        mock_func = mocker.MagicMock()

        # Call multiple times
        mock_func()
        mock_func()
        mock_func()

        # Verify call count
        assert mock_func.call_count == 3

    def test_patch_module_import(self, mocker):
        """Example: Patch imports to simulate external dependencies."""
        # Mock an external module
        mock_module = mocker.MagicMock()
        mocker.patch.dict("sys.modules", {"fake_module": mock_module})

        # Now code importing fake_module would get the mock
        assert mock_module is not None

    def test_patch_class_method(self, mocker):
        """Example: Patch a method on a class."""

        class MyClass:
            def method(self):
                return "original"

        obj = MyClass()
        original_result = obj.method()
        assert original_result == "original"

        # Patch the method
        mocker.patch.object(MyClass, "method", return_value="mocked")
        obj2 = MyClass()
        assert obj2.method() == "mocked"

    def test_spy_function_call(self, mocker):
        """Example: Spy on function calls (wrap without replacing)."""

        class ForSpying:
            def method(self, x):
                return x * 2

        obj = ForSpying()
        spy = mocker.spy(obj, "method")

        result = obj.method(10)

        assert result == 20
        spy.assert_called_once_with(10)


@pytest.mark.unit
class TestValidationPatterns:
    """Test examples for validation logic that doesn't require database."""

    def test_string_length_validation(self):
        """Example: Test string length validation."""

        def validate_name(name: str, min_length: int = 1, max_length: int = 255) -> str:
            """Validate name length."""
            if not name or len(name) < min_length:
                raise ValueError(f"Name must be at least {min_length} character(s)")
            if len(name) > max_length:
                raise ValueError(f"Name cannot exceed {max_length} characters")
            return name

        # Happy path
        assert validate_name("Test") == "Test"

        # Error cases
        with pytest.raises(ValueError, match="must be at least"):
            validate_name("")

        with pytest.raises(ValueError, match="cannot exceed"):
            validate_name("a" * 300)

    def test_enum_validation(self):
        """Example: Test enum validation."""
        from enum import Enum

        class Status(str, Enum):
            ACTIVE = "active"
            INACTIVE = "inactive"
            PENDING = "pending"

        def validate_status(status: str) -> Status:
            """Validate and return Status enum."""
            try:
                return Status(status)
            except ValueError:
                raise ValueError(f"Invalid status: {status}")

        # Happy path
        assert validate_status("active") == Status.ACTIVE

        # Error case
        with pytest.raises(ValueError, match="Invalid status"):
            validate_status("invalid")

    def test_type_validation(self):
        """Example: Test type validation."""

        def validate_port(port) -> int:
            """Validate port number."""
            if not isinstance(port, int):
                raise TypeError(f"Port must be int, got {type(port).__name__}")
            if not 1 <= port <= 65535:
                raise ValueError(f"Port must be 1-65535, got {port}")
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
    async def test_async_mock_example(self, mocker):
        """Example: Mock async functions."""
        # Create an async mock
        mock_async_func = mocker.AsyncMock(return_value="async result")

        # Call it
        result = await mock_async_func()

        # Verify
        assert result == "async result"
        mock_async_func.assert_called_once()

    @pytest.mark.asyncio
    async def test_async_mock_with_side_effect(self, mocker):
        """Example: Async mock that raises exceptions."""
        # Create async mock that raises
        mock_func = mocker.AsyncMock(side_effect=RuntimeError("Async error"))

        # Verify it raises
        with pytest.raises(RuntimeError, match="Async error"):
            await mock_func()

    @pytest.mark.asyncio
    async def test_async_context_manager_mock(self, mocker):
        """Example: Mock async context managers."""

        class AsyncResource:
            async def __aenter__(self):
                return "resource"

            async def __aexit__(self, *args):
                pass

        # Create mock context manager
        mock_resource = mocker.MagicMock()
        mock_resource.__aenter__ = mocker.AsyncMock(return_value="mocked_resource")
        mock_resource.__aexit__ = mocker.AsyncMock(return_value=None)

        # Use it
        async with mock_resource as resource:
            assert resource == "mocked_resource"

        mock_resource.__aenter__.assert_called_once()
