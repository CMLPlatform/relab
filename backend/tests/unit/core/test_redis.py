"""Unit tests for Redis helper utilities."""

from unittest.mock import AsyncMock

import pytest

from app.api.common.exceptions import ServiceUnavailableError
from app.core.redis import get_redis_value, require_redis


async def test_get_redis_value_failure_returns_none() -> None:
    """get_redis_value returns None when Redis raises."""
    redis_client = AsyncMock()
    redis_client.get.side_effect = TimeoutError("boom")

    result = await get_redis_value(redis_client, "key")

    assert result is None


def test_require_redis_raises_when_missing() -> None:
    """require_redis should raise a safe API error when Redis is unavailable."""
    with pytest.raises(ServiceUnavailableError) as exc_info:
        require_redis(None)

    assert exc_info.value.message == "Required service is temporarily unavailable."
    assert exc_info.value.log_message == "Redis is required for this operation."
