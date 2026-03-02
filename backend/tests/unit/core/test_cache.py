"""Unit tests for cache utilities."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from cachetools import TTLCache

from app.core.cache import async_ttl_cache

# Constants for test values to avoid magic value warnings
TEST_RESULT = "result"
TEST_ARG = "test"
TEST_ARG1 = "test1"
TEST_ARG2 = "test2"
RESULT_TEST1 = "result_test1"
RESULT_TEST2 = "result_test2"
RESULT_1 = "result_1"
RESULT_2 = "result_2"
RESULT_3 = "result_3"
RESULT_4 = "result_4"


class TestAsyncTTLCache:
    """Test suite for the async_ttl_cache decorator."""

    @pytest.mark.asyncio
    async def test_caches_result(self) -> None:
        """Test that the decorator caches async function results."""
        # Setup: Create a mock function that we can track calls to
        mock_func = AsyncMock(return_value=TEST_RESULT)
        cache = TTLCache(maxsize=10, ttl=60)

        # Decorate the mock function
        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await mock_func(arg)

        # Act: Call the function twice with the same argument
        result1 = await cached_func(TEST_ARG)
        result2 = await cached_func(TEST_ARG)

        # Assert: Function was only called once (second call used cache)
        assert result1 == TEST_RESULT
        assert result2 == TEST_RESULT
        assert mock_func.call_count == 1
        mock_func.assert_called_once_with(TEST_ARG)

    @pytest.mark.asyncio
    async def test_different_args_not_cached(self) -> None:
        """Test that different arguments result in separate cache entries."""
        # Setup
        mock_func = AsyncMock(side_effect=lambda x: f"result_{x}")
        cache = TTLCache(maxsize=10, ttl=60)

        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await mock_func(arg)

        # Act: Call with different arguments
        result1 = await cached_func(TEST_ARG1)
        result2 = await cached_func(TEST_ARG2)
        result3 = await cached_func(TEST_ARG1)  # Should use cache

        # Assert: Called twice for different args, but not for repeated arg
        assert result1 == RESULT_TEST1
        assert result2 == RESULT_TEST2
        assert result3 == RESULT_TEST1
        assert mock_func.call_count == 2

    @pytest.mark.asyncio
    async def test_ttl_expiration(self) -> None:
        """Test that cache entries expire after TTL."""
        # Setup: Very short TTL for testing
        mock_func = AsyncMock(return_value=TEST_RESULT)
        cache = TTLCache(maxsize=10, ttl=0.1)  # 100ms TTL

        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await mock_func(arg)

        # Act: Call, wait for expiration, call again
        result1 = await cached_func(TEST_ARG)
        await asyncio.sleep(0.15)  # Wait for TTL to expire
        result2 = await cached_func(TEST_ARG)

        # Assert: Function was called twice (cache expired)
        assert result1 == TEST_RESULT
        assert result2 == TEST_RESULT
        assert mock_func.call_count == 2

    @pytest.mark.asyncio
    async def test_maxsize_eviction(self) -> None:
        """Test that oldest entries are evicted when cache is full."""
        # Setup: Cache with maxsize of 2
        call_count = {"count": 0}

        async def incrementing_func(_arg: str) -> str:
            call_count["count"] += 1
            return f"result_{call_count['count']}"

        cache = TTLCache(maxsize=2, ttl=60)

        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await incrementing_func(arg)

        # Act: Fill cache beyond maxsize
        result1 = await cached_func("arg1")  # Cache: {arg1}
        result2 = await cached_func("arg2")  # Cache: {arg1, arg2}
        result3 = await cached_func("arg3")  # Cache: {arg2, arg3} (arg1 evicted)
        result1_again = await cached_func("arg1")  # Should call func again

        # Assert: arg1 was evicted and had to be recomputed
        assert result1 == RESULT_1
        assert result2 == RESULT_2
        assert result3 == RESULT_3
        assert result1_again == RESULT_4  # New call, not cached
        assert call_count["count"] == 4

    @pytest.mark.asyncio
    async def test_with_kwargs(self) -> None:
        """Test that cache works correctly with keyword arguments."""
        # Setup
        mock_func = AsyncMock(return_value=TEST_RESULT)
        cache = TTLCache(maxsize=10, ttl=60)

        @async_ttl_cache(cache)
        async def cached_func(arg1: str, arg2: str) -> str:
            return await mock_func(arg1, arg2)

        # Act: Call with same kwargs in different order
        result1 = await cached_func(arg1=TEST_ARG1, arg2=TEST_ARG2)
        result2 = await cached_func(arg2=TEST_ARG2, arg1=TEST_ARG1)

        # Assert: Both calls should use the same cache entry
        assert result1 == TEST_RESULT
        assert result2 == TEST_RESULT
        assert mock_func.call_count == 1

    @pytest.mark.asyncio
    async def test_preserves_function_metadata(self) -> None:
        """Test that the decorator preserves function name and docstring."""
        # Setup
        cache = TTLCache(maxsize=10, ttl=60)
        expected_name = "my_function"
        expected_doc = "This is a docstring."

        @async_ttl_cache(cache)
        async def my_function(arg: str) -> str:
            """This is a docstring."""
            return arg

        # Verify metadata is preserved
        assert my_function.__name__ == expected_name
        assert my_function.__doc__ == expected_doc

    @pytest.mark.asyncio
    async def test_exception_not_cached(self) -> None:
        """Test that exceptions are not cached."""
        # Setup
        call_count = {"count": 0}
        error_msg = "Temporary error"
        success_msg = "success"

        async def failing_func(_arg: str) -> str:
            call_count["count"] += 1
            if call_count["count"] <= 2:
                raise ValueError(error_msg)
            return success_msg

        cache = TTLCache(maxsize=10, ttl=60)

        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await failing_func(arg)

        # Act: Call until success
        with pytest.raises(ValueError, match=error_msg):
            await cached_func(TEST_ARG)

        with pytest.raises(ValueError, match=error_msg):
            await cached_func(TEST_ARG)

        result = await cached_func(TEST_ARG)

        # Assert: Function was called 3 times (exceptions not cached)
        assert result == success_msg
        assert call_count["count"] == 3

    @pytest.mark.asyncio
    async def test_concurrent_calls(self) -> None:
        """Test behavior with concurrent calls."""
        # Setup
        call_count = {"count": 0}

        async def slow_func(_arg: str) -> str:
            call_count["count"] += 1
            await asyncio.sleep(0.05)  # Simulate slow operation
            return f"result_{call_count['count']}"

        cache = TTLCache(maxsize=10, ttl=60)

        @async_ttl_cache(cache)
        async def cached_func(arg: str) -> str:
            return await slow_func(arg)

        # Act: Make concurrent calls
        results = await asyncio.gather(
            cached_func(TEST_ARG),
            cached_func(TEST_ARG),
            cached_func(TEST_ARG),
        )

        # Note: Without locking, multiple calls may execute since they start
        # before any completes. This is expected behavior for a simple cache.
        assert len(results) == 3
        assert all(isinstance(r, str) for r in results)
        assert all(r.startswith("result_") for r in results)
