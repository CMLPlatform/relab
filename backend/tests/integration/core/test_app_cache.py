"""Integration tests for endpoint caching with the shared cache wrapper."""
# spell-checker: ignore etagged

from __future__ import annotations

import asyncio
import pickle
from typing import TYPE_CHECKING

import pytest
from cashews.backends import memory as memory_backend
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse, Response
from httpx import ASGITransport, AsyncClient

from app.core.cache import (
    cache,
    clear_cache_namespace,
    close_cache,
    init_cache,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

EXPIRE_60 = 60
EXPIRE_1 = 1


@pytest.fixture
async def cache_app() -> AsyncGenerator[FastAPI]:
    """Create a minimal FastAPI app with in-memory caching configured."""
    await close_cache()
    init_cache(None)

    app = FastAPI()
    router = APIRouter()
    call_counts = {"cached_endpoint": 0}

    @router.get("/cached-endpoint")
    @cache(expire=EXPIRE_60)
    async def cached_endpoint(value: str) -> dict:
        call_counts["cached_endpoint"] += 1
        return {"result": f"processed_{value}", "call_count": call_counts["cached_endpoint"]}

    app.include_router(router)

    try:
        yield app
    finally:
        await close_cache()


class TestAppCacheIntegration:
    """Integration tests for cached FastAPI endpoints."""

    async def test_cache_hit_on_second_request(self, cache_app: FastAPI) -> None:
        """Test that second request returns cached response with HIT header."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            response1 = await client.get("/cached-endpoint?value=test")
            assert response1.status_code == 200
            assert response1.json() == {"result": "processed_test", "call_count": 1}

            response2 = await client.get("/cached-endpoint?value=test")
            assert response2.status_code == 200
            assert response2.json() == {"result": "processed_test", "call_count": 1}

    async def test_different_params_different_cache(self, cache_app: FastAPI) -> None:
        """Test that different parameters create separate cache entries."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            response1 = await client.get("/cached-endpoint?value=test1")
            assert response1.status_code == 200
            assert response1.json()["call_count"] == 1

            response2 = await client.get("/cached-endpoint?value=test2")
            assert response2.status_code == 200
            assert response2.json()["call_count"] == 2

            response3 = await client.get("/cached-endpoint?value=test1")
            assert response3.status_code == 200
            assert response3.json()["call_count"] == 1

    async def test_cache_ttl_expiration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that cache entries expire after TTL."""
        fake_now = {"value": 1_700_000_000.0}

        def _fake_time() -> float:
            return fake_now["value"]

        monkeypatch.setattr(memory_backend.time, "time", _fake_time)
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"short_ttl": 0}

        @router.get("/short-ttl")
        @cache(expire=EXPIRE_1)
        async def short_ttl_endpoint(value: str) -> dict:
            call_count["short_ttl"] += 1
            return {"result": f"processed_{value}", "call_count": call_count["short_ttl"]}

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/short-ttl?value=test")
                assert response1.json()["call_count"] == 1

                response2 = await client.get("/short-ttl?value=test")
                assert response2.json()["call_count"] == 1

                fake_now["value"] += 1.1

                response3 = await client.get("/short-ttl?value=test")
                assert response3.json()["call_count"] == 2
        finally:
            await close_cache()

    async def test_session_exclusion_from_cache_key(self) -> None:
        """Dependencies should not affect the cache key when request params are unchanged."""
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"cached_with_dependency": 0}

        async def get_context() -> dict[str, str]:
            return {"request_id": "123"}

        @router.get("/cached-with-dependency", dependencies=[Depends(get_context)])
        @cache(expire=EXPIRE_60)
        async def cached_with_dependency(value: str) -> dict:
            call_count["cached_with_dependency"] += 1
            return {"result": f"processed_{value}", "call_count": call_count["cached_with_dependency"]}

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/cached-with-dependency?value=test")
                assert response1.status_code == 200
                assert response1.json()["result"] == "processed_test"
                assert response1.json()["call_count"] == 1

                response2 = await client.get("/cached-with-dependency?value=test")
                assert response2.status_code == 200
                assert response2.json()["call_count"] == 1
        finally:
            await close_cache()

    async def test_concurrent_requests_same_endpoint(self, cache_app: FastAPI) -> None:
        """Concurrent requests should all succeed even before the cache warms."""
        async with AsyncClient(transport=ASGITransport(app=cache_app), base_url="http://test") as client:
            responses = await asyncio.gather(
                client.get("/cached-endpoint?value=concurrent"),
                client.get("/cached-endpoint?value=concurrent"),
                client.get("/cached-endpoint?value=concurrent"),
            )

            assert all(r.status_code == 200 for r in responses)
            call_counts = [r.json()["call_count"] for r in responses]
            assert 1 in call_counts

    async def test_cache_different_endpoints_separate(self) -> None:
        """Different endpoints should maintain separate cache entries."""
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"endpoint1": 0, "endpoint2": 0}

        @router.get("/endpoint1")
        @cache(expire=EXPIRE_60)
        async def endpoint1() -> dict:
            call_count["endpoint1"] += 1
            return {"endpoint": "1", "call_count": call_count["endpoint1"]}

        @router.get("/endpoint2")
        @cache(expire=EXPIRE_60)
        async def endpoint2() -> dict:
            call_count["endpoint2"] += 1
            return {"endpoint": "2", "call_count": call_count["endpoint2"]}

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/endpoint1")
                assert response1.json()["call_count"] == 1

                response2 = await client.get("/endpoint2")
                assert response2.json()["call_count"] == 1

                response3 = await client.get("/endpoint1")
                assert response3.json()["call_count"] == 1
        finally:
            await close_cache()

    async def test_cache_clear_namespace(self) -> None:
        """Clearing a namespace should invalidate matching cached endpoints."""
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"namespaced": 0}

        @router.get("/namespaced")
        @cache(expire=EXPIRE_60, namespace="test-namespace")
        async def namespaced_endpoint(value: str) -> dict:
            call_count["namespaced"] += 1
            return {"result": value, "call_count": call_count["namespaced"]}

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/namespaced?value=test")
                assert response1.json()["call_count"] == 1

                response2 = await client.get("/namespaced?value=test")
                assert response2.json()["call_count"] == 1

                await clear_cache_namespace("test-namespace")

                response3 = await client.get("/namespaced?value=test")
                assert response3.json()["call_count"] == 2
        finally:
            await close_cache()

    async def test_cached_response_supports_conditional_get(self) -> None:
        """Cached Response objects should still support ETag-based 304 responses."""
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"etagged": 0}

        @router.get("/etagged")
        @cache(expire=EXPIRE_60)
        async def etagged_endpoint(request: Request) -> JSONResponse:
            _ = request
            call_count["etagged"] += 1
            return JSONResponse({"value": "fresh"}, headers={"ETag": '"profile-v1"'})

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/etagged")
                assert response1.status_code == 200
                assert response1.json() == {"value": "fresh"}

                response2 = await client.get("/etagged", headers={"If-None-Match": '"profile-v1"'})
                assert response2.status_code == 304
                assert call_count["etagged"] == 1
        finally:
            await close_cache()

    def test_cached_response_survives_pickle_round_trip(self) -> None:
        """Redis backends store cached values via pickle; Response objects must round-trip intact."""
        original = JSONResponse(
            {"value": "fresh"},
            status_code=201,
            headers={"ETag": '"v1"', "X-Custom": "keep-me"},
        )

        restored = pickle.loads(pickle.dumps(original))

        assert isinstance(restored, JSONResponse)
        assert restored.status_code == original.status_code
        assert restored.body == original.body
        assert restored.media_type == original.media_type
        assert dict(restored.headers) == dict(original.headers)

    async def test_cold_not_modified_response_is_not_cached_as_canonical_response(self) -> None:
        """A cold 304 should not poison the cache for later unconditional requests."""
        await close_cache()
        init_cache(None)

        app = FastAPI()
        router = APIRouter()
        call_count = {"conditional": 0}

        @router.get("/conditional")
        @cache(expire=EXPIRE_60)
        async def conditional_endpoint(if_none_match: str | None = None) -> Response:
            call_count["conditional"] += 1
            headers = {"ETag": '"resource-v1"'}
            if if_none_match == '"resource-v1"':
                return Response(status_code=304, headers=headers)
            return JSONResponse({"value": "fresh"}, headers=headers)

        app.include_router(router)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response1 = await client.get("/conditional?if_none_match=%22resource-v1%22")
                assert response1.status_code == 304

                response2 = await client.get("/conditional")
                assert response2.status_code == 200
                assert response2.json() == {"value": "fresh"}
                assert call_count["conditional"] == 2

                response3 = await client.get("/conditional")
                assert response3.status_code == 200
                assert response3.json() == {"value": "fresh"}
                assert call_count["conditional"] == 2
        finally:
            await close_cache()
