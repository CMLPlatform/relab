"""Shared auth unit-test fixtures."""

from typing import TYPE_CHECKING

import pytest
from fakeredis.aioredis import FakeRedis

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from redis.asyncio import Redis


@pytest.fixture
async def redis_client() -> AsyncGenerator[Redis]:
    """Provide an isolated fake Redis client without pulling in app-level fixtures."""
    client = FakeRedis(decode_responses=True, version=7)
    yield client
    await client.aclose()
