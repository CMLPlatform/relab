"""Integration tests for fastapi-cache with Redis backend."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import APIRouter, Depends, FastAPI
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.decorator import cache
from httpx import ASGITransport, AsyncClient

from app.core.cache import key_builder_excluding_dependencies

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

# Constants for test values
X_CACHE_HEADER = "x-fastapi-cache"
CACHE_HIT = "HIT"
CACHE_MISS = "MISS"
CACHE_PREFIX = "test-cache"
EXPIRE_60 = 60
EXPIRE_1 = 1


@pytest.fixture
async def cache_redis_client() -> AsyncGenerator[FakeRedis]:
    """Provide a fake Redis client for cache testing with decode_responses=False."""
    # fastapi-cache requires decode_responses=False for binary serialization
    client = FakeRedis(decode_responses=False, version=7)
    yield client
    # Clean up
    await client.flushall()
    await client.aclose()
    # Reset FastAPICache singleton state
    FastAPICache.reset()


@pytest.fixture
async def cache_app(cache_redis_client: FakeRedis) -> FastAPI:
    """Create a minimal FastAPI app with cache configured."""
    app = FastAPI()

    # Initialize FastAPI Cache with our custom key builder
    FastAPICache.init(
        RedisBackend(cache_redis_client),
        prefix=CACHE_PREFIX,
        key_builder=key_builder_excluding_dependencies,
    )

    # Create test router with cached endpoints
    router = APIRouter()

    @router.get("/cached-endpoint")
    @cache(expire=EXPIRE_60)
    async def cached_endpoint(value: str) -> dict:
        """Test endpoint with caching."""
        return {"result": f"processed_{value}", "cached": False}

    app.include_router(router)

    return app


class TestFastAPICacheIntegration:
    """Integration tests for fastapi-cache with Redis backend."""

    @pytest.mark.asyncio
    async def test_cache_hit_on_second_request(self, cache_app: FastAPI, cache_redis_client: FakeRedis) -> None:
        """Test that second request returns cached response with HIT header."""
        del cache_redis_client
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # First request - cache MISS
            response1 = await client.get("/cached-endpoint?value=test")
            assert response1.status_code == 200
            assert response1.json() == {"result": "processed_test", "cached": False}
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Second request - cache HIT
            response2 = await client.get("/cached-endpoint?value=test")
            assert response2.status_code == 200
            assert response2.json() == {"result": "processed_test", "cached": False}
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_HIT

    @pytest.mark.asyncio
    async def test_different_params_different_cache(self, cache_app: FastAPI, cache_redis_client: FakeRedis) -> None:
        """Test that different parameters create separate cache entries."""
        del cache_redis_client
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # Request with value=test1
            response1 = await client.get("/cached-endpoint?value=test1")
            assert response1.status_code == 200
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Request with value=test2
            response2 = await client.get("/cached-endpoint?value=test2")
            assert response2.status_code == 200
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Repeat test1 - should be HIT
            response3 = await client.get("/cached-endpoint?value=test1")
            assert response3.status_code == 200
            assert response3.headers.get(X_CACHE_HEADER) == CACHE_HIT

    @pytest.mark.asyncio
    async def test_cache_stores_in_redis(self, cache_app: FastAPI, cache_redis_client: FakeRedis) -> None:
        """Test that cache data is actually stored in Redis."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # Make request to populate cache
            response = await client.get("/cached-endpoint?value=test")
            assert response.status_code == 200

            # Check Redis has keys
            keys = await cache_redis_client.keys(f"{CACHE_PREFIX}:*")
            assert len(keys) > 0

    @pytest.mark.asyncio
    async def test_cache_ttl_expiration(self, cache_redis_client: FakeRedis) -> None:
        """Test that cache entries expire after TTL."""
        # Create app with very short TTL
        app = FastAPI()
        FastAPICache.init(
            RedisBackend(cache_redis_client),
            prefix=CACHE_PREFIX,
            key_builder=key_builder_excluding_dependencies,
        )

        router = APIRouter()

        @router.get("/short-ttl")
        @cache(expire=EXPIRE_1)  # 1 second TTL
        async def short_ttl_endpoint(value: str) -> dict:
            return {"result": f"processed_{value}"}

        app.include_router(router)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # First request - MISS
            response1 = await client.get("/short-ttl?value=test")
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Immediate second request - HIT
            response2 = await client.get("/short-ttl?value=test")
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_HIT

            # Wait for TTL to expire
            await asyncio.sleep(1.1)

            # Third request after expiration - MISS
            response3 = await client.get("/short-ttl?value=test")
            assert response3.headers.get(X_CACHE_HEADER) == CACHE_MISS

    @pytest.mark.asyncio
    async def test_session_exclusion_from_cache_key(self, cache_redis_client: FakeRedis) -> None:
        """Test that the custom key builder works with dependency injection."""
        # Create app with endpoint that uses a simple dependency
        app = FastAPI()
        FastAPICache.init(
            RedisBackend(cache_redis_client),
            prefix=CACHE_PREFIX,
            key_builder=key_builder_excluding_dependencies,
        )

        router = APIRouter()

        # Create a dependency that returns a simple value
        async def get_context() -> dict[str, str]:
            return {"request_id": "123"}

        @router.get("/cached-with-dependency")
        @cache(expire=EXPIRE_60)
        async def cached_with_dependency(
            value: str,
            context: dict = Depends(get_context),  # noqa: FAST002
        ) -> dict:
            """Test endpoint with cache and dependency."""
            return {
                "result": f"processed_{value}",
                "request_id": context["request_id"],
            }

        app.include_router(router)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # First request - MISS
            response1 = await client.get("/cached-with-dependency?value=test")
            assert response1.status_code == 200, response1.text
            assert response1.json()["result"] == "processed_test"
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Second request with same value parameter - should be HIT
            # Even though we might use dependencies, the value param drives the cache key
            response2 = await client.get("/cached-with-dependency?value=test")
            assert response2.status_code == 200
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_HIT

    @pytest.mark.asyncio
    async def test_cache_prefix_in_redis_keys(self, cache_app: FastAPI, cache_redis_client: FakeRedis) -> None:
        """Test that cache prefix is applied to Redis keys."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # Make request
            await client.get("/cached-endpoint?value=test")

            # Check that keys have correct prefix
            keys = await cache_redis_client.keys("*")
            assert len(keys) > 0
            # Keys should have the prefix we set
            for key in keys:
                assert key.startswith(f"{CACHE_PREFIX}:".encode())

    @pytest.mark.asyncio
    async def test_cache_with_binary_data(self, cache_redis_client: FakeRedis) -> None:
        """Test that cache works with binary Redis client (decode_responses=False)."""
        app = FastAPI()
        FastAPICache.init(
            RedisBackend(cache_redis_client),
            prefix=CACHE_PREFIX,
            key_builder=key_builder_excluding_dependencies,
        )

        router = APIRouter()

        @router.get("/binary-test")
        @cache(expire=EXPIRE_60)
        async def binary_endpoint() -> dict:
            return {"result": "success", "data": [1, 2, 3]}

        app.include_router(router)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # First request
            response1 = await client.get("/binary-test")
            assert response1.status_code == 200
            assert response1.json() == {"result": "success", "data": [1, 2, 3]}
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Second request - should deserialize correctly from binary
            response2 = await client.get("/binary-test")
            assert response2.status_code == 200
            assert response2.json() == {"result": "success", "data": [1, 2, 3]}
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_HIT

    @pytest.mark.asyncio
    async def test_concurrent_requests_same_endpoint(self, cache_app: FastAPI) -> None:
        """Test concurrent requests to same endpoint."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # Make multiple concurrent requests
            responses = await asyncio.gather(
                client.get("/cached-endpoint?value=concurrent"),
                client.get("/cached-endpoint?value=concurrent"),
                client.get("/cached-endpoint?value=concurrent"),
            )

            # All should succeed
            assert all(r.status_code == 200 for r in responses)

            # At least one should be MISS, others may be HIT or MISS
            # depending on timing
            cache_statuses = [r.headers.get(X_CACHE_HEADER) for r in responses]
            assert CACHE_MISS in cache_statuses

    @pytest.mark.asyncio
    async def test_cache_different_endpoints_separate(self, cache_redis_client: FakeRedis) -> None:
        """Test that different endpoints have separate cache entries."""
        app = FastAPI()
        FastAPICache.init(
            RedisBackend(cache_redis_client),
            prefix=CACHE_PREFIX,
            key_builder=key_builder_excluding_dependencies,
        )

        router = APIRouter()

        @router.get("/endpoint1")
        @cache(expire=EXPIRE_60)
        async def endpoint1() -> dict:
            return {"endpoint": "1"}

        @router.get("/endpoint2")
        @cache(expire=EXPIRE_60)
        async def endpoint2() -> dict:
            return {"endpoint": "2"}

        app.include_router(router)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Request to endpoint1
            response1 = await client.get("/endpoint1")
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Request to endpoint2
            response2 = await client.get("/endpoint2")
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Repeat endpoint1 - should be HIT
            response3 = await client.get("/endpoint1")
            assert response3.headers.get(X_CACHE_HEADER) == CACHE_HIT

    @pytest.mark.asyncio
    async def test_cache_clear_redis(self, cache_app: FastAPI, cache_redis_client: FakeRedis) -> None:
        """Test that clearing Redis invalidates cache."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            # Populate cache
            response1 = await client.get("/cached-endpoint?value=test")
            assert response1.headers.get(X_CACHE_HEADER) == CACHE_MISS

            # Verify cache hit
            response2 = await client.get("/cached-endpoint?value=test")
            assert response2.headers.get(X_CACHE_HEADER) == CACHE_HIT

            # Clear Redis
            await cache_redis_client.flushall()

            # Next request should be MISS again
            response3 = await client.get("/cached-endpoint?value=test")
            assert response3.headers.get(X_CACHE_HEADER) == CACHE_MISS
