"""Unit tests for cache utilities."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cachetools import TTLCache
from fastapi.responses import HTMLResponse

from app.core.cache import HTMLCoder, async_ttl_cache, clear_cache_namespace, init_fastapi_cache

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


class TestHTMLCoder:
    """Tests for HTMLCoder encode/decode."""

    def test_encode_html_response(self) -> None:
        """Test encoding an HTMLResponse extracts body and metadata."""
        response = HTMLResponse(content="<h1>Hello</h1>", status_code=200)
        encoded = HTMLCoder.encode(response)

        decoded = json.loads(encoded)
        assert decoded["type"] == "HTMLResponse"
        assert decoded["body"] == "<h1>Hello</h1>"
        assert decoded["status_code"] == 200

    def test_encode_dict(self) -> None:
        """Test encoding a regular dict uses JSON."""
        data = {"key": "value", "count": 42}
        encoded = HTMLCoder.encode(data)

        decoded = json.loads(encoded)
        assert decoded == data

    def test_decode_html_response(self) -> None:
        """Test decoding reconstructs an HTMLResponse."""
        payload = json.dumps(
            {"type": "HTMLResponse", "body": "<p>Hi</p>", "status_code": 200, "media_type": "text/html", "headers": {}}
        ).encode("utf-8")

        result = HTMLCoder.decode(payload)

        assert isinstance(result, HTMLResponse)

    def test_decode_regular_data(self) -> None:
        """Test decoding regular JSON data returns the original value."""
        data = {"key": "value"}
        encoded = json.dumps(data).encode("utf-8")

        result = HTMLCoder.decode(encoded)

        assert result == data

    def test_decode_string_input(self) -> None:
        """Test decoding handles string (not bytes) input."""
        data = [1, 2, 3]
        encoded_str = json.dumps(data)

        result = HTMLCoder.decode(encoded_str)

        assert result == data

class TestInitFastapiCache:
    """Tests for init_fastapi_cache."""

    def test_init_with_redis_client(self) -> None:
        """Test cache init uses Redis backend when redis_client is provided."""
        redis_client = MagicMock()

        with (
            patch("app.core.cache.settings") as mock_settings,
            patch("app.core.cache.FastAPICache") as mock_cache,
            patch("app.core.cache.RedisBackend") as mock_backend,
        ):
            mock_settings.enable_caching = True
            mock_settings.cache.prefix = "test"

            init_fastapi_cache(redis_client)

            mock_backend.assert_called_once_with(redis_client)
            mock_cache.init.assert_called_once()

    def test_init_without_redis_uses_in_memory(self) -> None:
        """Test cache init falls back to in-memory when redis_client is None."""
        with (
            patch("app.core.cache.settings") as mock_settings,
            patch("app.core.cache.FastAPICache") as mock_cache,
            patch("app.core.cache.InMemoryBackend") as mock_backend,
        ):
            mock_settings.enable_caching = True
            mock_settings.cache.prefix = "test"

            init_fastapi_cache(None)

            mock_backend.assert_called_once()
            mock_cache.init.assert_called_once()

    def test_init_caching_disabled_uses_in_memory(self) -> None:
        """Test that when caching is disabled, InMemoryBackend is used."""
        with (
            patch("app.core.cache.settings") as mock_settings,
            patch("app.core.cache.FastAPICache") as mock_cache,
            patch("app.core.cache.InMemoryBackend") as mock_backend,
        ):
            mock_settings.enable_caching = False
            mock_settings.cache.prefix = "test"
            mock_settings.environment = "testing"

            init_fastapi_cache(None)

            mock_backend.assert_called_once()
            mock_cache.init.assert_called_once()


class TestClearCacheNamespace:
    """Tests for clear_cache_namespace."""

    @pytest.mark.asyncio
    async def test_clear_cache_namespace(self) -> None:
        """Test that clear_cache_namespace calls FastAPICache.clear with namespace."""
        with patch("app.core.cache.FastAPICache") as mock_cache:
            mock_cache.clear = AsyncMock()

            await clear_cache_namespace("test-namespace")

            mock_cache.clear.assert_called_once_with(namespace="test-namespace")
