"""Tests for global HTTP method policy."""

from __future__ import annotations

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.middleware.method_policy import register_method_policy_middleware


def _create_method_policy_app() -> FastAPI:
    app = FastAPI()
    register_method_policy_middleware(app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


async def test_method_policy_allows_supported_methods() -> None:
    """Normal application methods should pass through to routing."""
    app = _create_method_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_method_policy_blocks_dangerous_unused_methods() -> None:
    """TRACE/TRACK/CONNECT should be blocked before route handling."""
    app = _create_method_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for method in ("TRACE", "TRACK", "CONNECT"):
            response = await client.request(method, "/health")

            assert response.status_code == 405
            assert response.headers["allow"] == "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
