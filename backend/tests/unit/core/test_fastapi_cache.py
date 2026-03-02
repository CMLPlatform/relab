"""Unit tests for fastapi-cache key builder."""

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import key_builder_excluding_dependencies

if TYPE_CHECKING:
    import pytest_mock


class TestKeyBuilderExcludingDependencies:
    """Test suite for the custom fastapi-cache key builder."""

    def test_same_args_same_key(self) -> None:
        """Test that identical arguments produce the same cache key."""
        # Setup: Mock function
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate keys with same arguments
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"param1": "value1", "param2": "value2"},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"param1": "value1", "param2": "value2"},
        )

        # Assert: Keys are identical
        assert key1 == key2
        assert key1.startswith("test:")

    def test_different_args_different_keys(self) -> None:
        """Test that different arguments produce different cache keys."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate keys with different arguments
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"param": "value1"},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"param": "value2"},
        )

        # Assert: Keys are different
        assert key1 != key2

    def test_excludes_async_session(self, mocker: pytest_mock.MockerFixture) -> None:
        """Test that AsyncSession instances are excluded from cache key generation."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Create mock AsyncSession instances (different instances)
        mock_session1 = mocker.Mock(spec=AsyncSession)
        mock_session2 = mocker.Mock(spec=AsyncSession)

        # Act: Generate keys with different session instances but same other params
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"session": mock_session1, "param": "value"},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"session": mock_session2, "param": "value"},
        )

        # Assert: Keys are identical despite different session instances
        assert key1 == key2

    def test_includes_non_excluded_params(self, mocker: pytest_mock.MockerFixture) -> None:
        """Test that non-excluded parameters are included in cache key."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        mock_session = mocker.Mock(spec=AsyncSession)

        # Act: Generate keys with different non-excluded params
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"session": mock_session, "filter": "active"},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs={"session": mock_session, "filter": "inactive"},
        )

        # Assert: Keys are different due to different filter values
        assert key1 != key2

    def test_handles_none_kwargs(self) -> None:
        """Test that None kwargs are handled gracefully."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate key with None kwargs
        key = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=(),
            kwargs=None,
        )

        # Assert: Key is generated successfully
        assert isinstance(key, str)
        assert key.startswith("test:")

    def test_includes_positional_args(self) -> None:
        """Test that positional arguments are included in cache key."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate keys with different positional args
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=("arg1", "arg2"),
            kwargs={},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="test",
            args=("arg1", "arg3"),
            kwargs={},
        )

        # Assert: Keys are different
        assert key1 != key2

    def test_includes_function_identity(self) -> None:
        """Test that different functions produce different cache keys."""
        # Setup
        def func1() -> None:
            pass

        def func2() -> None:
            pass

        func1.__module__ = "test.module"
        func1.__name__ = "func1"
        func2.__module__ = "test.module"
        func2.__name__ = "func2"

        # Act: Generate keys for different functions with same args
        key1 = key_builder_excluding_dependencies(
            func1,
            namespace="test",
            args=(),
            kwargs={"param": "value"},
        )

        key2 = key_builder_excluding_dependencies(
            func2,
            namespace="test",
            args=(),
            kwargs={"param": "value"},
        )

        # Assert: Keys are different
        assert key1 != key2

    def test_namespace_affects_key(self) -> None:
        """Test that different namespaces produce different cache keys."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate keys with different namespaces
        key1 = key_builder_excluding_dependencies(
            mock_func,
            namespace="namespace1",
            args=(),
            kwargs={"param": "value"},
        )

        key2 = key_builder_excluding_dependencies(
            mock_func,
            namespace="namespace2",
            args=(),
            kwargs={"param": "value"},
        )

        # Assert: Keys are different
        assert key1 != key2
        assert key1.startswith("namespace1:")
        assert key2.startswith("namespace2:")

    def test_empty_namespace(self) -> None:
        """Test that empty namespace produces valid cache key."""
        # Setup
        def mock_func() -> None:
            pass

        mock_func.__module__ = "test.module"
        mock_func.__name__ = "test_func"

        # Act: Generate key with empty namespace
        key = key_builder_excluding_dependencies(
            mock_func,
            namespace="",
            args=(),
            kwargs={},
        )

        # Assert: Key is generated and starts with colon
        assert isinstance(key, str)
        assert key.startswith(":")
