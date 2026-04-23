"""Redis fixtures for testing with fakeredis."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fakeredis.aioredis import FakeRedis

from app.core.redis import get_redis

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi import FastAPI
    from redis.asyncio import Redis


@pytest.fixture
async def redis_client() -> AsyncGenerator[Redis]:
    """Provide a fake async Redis client for testing.

    Uses fakeredis to simulate Redis without requiring a running Redis server.
    Each test gets its own isolated client instance, so teardown only needs to
    close the connection.
    """
    client = FakeRedis(decode_responses=True, version=7)
    yield client
    await client.aclose()


@pytest.fixture
async def mock_redis_dependency(test_app: FastAPI, redis_client: Redis) -> AsyncGenerator[Redis]:
    """Override the Redis dependency in the FastAPI app.

    This allows tests to use the fake Redis client instead of connecting to a real Redis instance.
    """

    async def override_get_redis() -> Redis:
        return redis_client

    test_app.dependency_overrides[get_redis] = override_get_redis
    yield redis_client
    test_app.dependency_overrides.pop(get_redis, None)
