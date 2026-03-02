"""Unit tests for Redis core utilities."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.redis import (
    close_redis,
    get_redis,
    get_redis_dependency,
    get_redis_value,
    init_redis,
    ping_redis,
    set_redis_value,
)

# Constants for test values to avoid magic value warnings
TEST_KEY = "test_key"
TEST_VALUE = "test_value"
CACHED_VALUE = "cached_value"
FAKE_REDIS = "fake_redis"
ERROR_MSG = "Error"
TIMEOUT_MSG = "Timeout"
CONN_FAILED_MSG = "Connection failed"


@pytest.fixture
def mock_redis() -> AsyncMock:
    """Fixture for a mock Redis client."""
    return AsyncMock()


class TestRedisCore:
    """Test suite for Redis core functionality."""

    @patch("app.core.redis.Redis")
    async def test_init_redis_success(self, mock_redis_class: MagicMock) -> None:
        """Test successful Redis initialization."""
        mock_client = AsyncMock()
        mock_pubsub = MagicMock()
        mock_pubsub.ping = AsyncMock()
        mock_client.pubsub = MagicMock(return_value=mock_pubsub)
        mock_redis_class.return_value = mock_client

        result = await init_redis()

        assert result is mock_client
        mock_pubsub.ping.assert_called_once()

    @patch("app.core.redis.Redis")
    async def test_init_redis_failure(self, mock_redis_class: MagicMock) -> None:
        """Test Redis initialization failure when ping fails."""
        mock_client = AsyncMock()
        mock_pubsub = MagicMock()
        mock_pubsub.ping = AsyncMock(side_effect=RedisConnectionError(CONN_FAILED_MSG))
        mock_client.pubsub = MagicMock(return_value=mock_pubsub)
        mock_redis_class.return_value = mock_client

        result = await init_redis()

        assert result is None

    async def test_close_redis(self, mock_redis: AsyncMock) -> None:
        """Test closing a Redis client."""
        await close_redis(mock_redis)
        mock_redis.aclose.assert_called_once()

    async def test_close_redis_none(self) -> None:
        """Test closing a None Redis client handles gracefully."""
        # Should gracefully handle None
        await close_redis(None)

    async def test_ping_redis_success(self, mock_redis: AsyncMock) -> None:
        """Test successful Redis ping."""
        mock_pubsub = MagicMock()
        mock_pubsub.ping = AsyncMock()
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

        result = await ping_redis(mock_redis)
        assert result is True
        mock_pubsub.ping.assert_called_once()

    async def test_ping_redis_failure(self, mock_redis: AsyncMock) -> None:
        """Test Redis ping failure."""
        mock_pubsub = MagicMock()
        mock_pubsub.ping = AsyncMock(side_effect=RedisTimeoutError(TIMEOUT_MSG))
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

        result = await ping_redis(mock_redis)
        assert result is False

    async def test_get_redis_value_success(self, mock_redis: AsyncMock) -> None:
        """Test successful retrieval of a value from Redis."""
        mock_redis.get.return_value = CACHED_VALUE
        result = await get_redis_value(mock_redis, TEST_KEY)
        assert result == CACHED_VALUE
        mock_redis.get.assert_called_once_with(TEST_KEY)

    async def test_get_redis_value_failure(self, mock_redis: AsyncMock) -> None:
        """Test failure during Redis value retrieval."""
        mock_redis.get.side_effect = RedisError(ERROR_MSG)
        result = await get_redis_value(mock_redis, TEST_KEY)
        assert result is None

    async def test_set_redis_value_success(self, mock_redis: AsyncMock) -> None:
        """Test successful setting of a value in Redis."""
        result = await set_redis_value(mock_redis, TEST_KEY, TEST_VALUE, ex=60)
        assert result is True
        mock_redis.set.assert_called_once_with(TEST_KEY, TEST_VALUE, ex=60)

    async def test_set_redis_value_failure(self, mock_redis: AsyncMock) -> None:
        """Test failure during Redis value storage."""
        mock_redis.set.side_effect = RedisError(ERROR_MSG)
        result = await set_redis_value(mock_redis, TEST_KEY, TEST_VALUE, ex=60)
        assert result is False

    def test_get_redis_dependency(self) -> None:
        """Test getting Redis client from request app state (dependency style)."""
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.redis = FAKE_REDIS

        result = get_redis_dependency(mock_request)
        assert result == FAKE_REDIS

    def test_get_redis_success(self) -> None:
        """Test successful retrieval of Redis client from request."""
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.redis = FAKE_REDIS

        result = get_redis(mock_request)
        assert result == FAKE_REDIS

    def test_get_redis_failure(self) -> None:
        """Test failure when Redis client is missing from request."""
        mock_request = MagicMock(spec=Request)
        mock_request.app.state.redis = None

        with pytest.raises(RuntimeError, match="Redis not available"):
            get_redis(mock_request)
