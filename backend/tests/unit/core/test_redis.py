"""Unit tests for Redis helper utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.core.redis import delete_redis_key, get_redis_value, require_redis, set_redis_value


@pytest.mark.unit
class TestRedisHelpers:
    """Test shared Redis helper functions."""

    async def test_get_redis_value_success(self) -> None:
        """get_redis_value returns the stored string value."""
        redis_client = AsyncMock()
        redis_client.get.return_value = "value"

        result = await get_redis_value(redis_client, "key")

        assert result == "value"
        redis_client.get.assert_awaited_once_with("key")

    async def test_get_redis_value_failure_returns_none(self) -> None:
        """get_redis_value returns None when Redis raises."""
        redis_client = AsyncMock()
        redis_client.get.side_effect = TimeoutError("boom")

        result = await get_redis_value(redis_client, "key")

        assert result is None

    async def test_set_redis_value_success(self) -> None:
        """set_redis_value returns True when the write succeeds."""
        redis_client = AsyncMock()

        result = await set_redis_value(redis_client, "key", "value", ex=60)

        assert result is True
        redis_client.set.assert_awaited_once_with("key", "value", ex=60)

    async def test_delete_redis_key_success(self) -> None:
        """delete_redis_key returns True when the delete succeeds."""
        redis_client = AsyncMock()

        result = await delete_redis_key(redis_client, "key")

        assert result is True
        redis_client.delete.assert_awaited_once_with("key")

    def test_require_redis_raises_when_missing(self) -> None:
        """require_redis should raise an HTTPException when Redis is unavailable."""
        with pytest.raises(HTTPException, match=r"Redis is required for this operation\."):
            require_redis(None)
