"""Tests for the composed backend middleware stack."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.config import Environment, settings
from app.core.http_headers import REQUEST_ID_HEADER
from app.core.middleware import register_middleware
from app.core.middleware.method_policy import ALLOW_HEADER_VALUE, CORS_HTTP_METHODS
from app.core.middleware.response_policy import HSTS_HEADER_VALUE

if TYPE_CHECKING:
    import pytest


def _create_composed_middleware_app() -> FastAPI:
    app = FastAPI()
    register_middleware(app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/json")
    async def json_probe(request: Request) -> dict[str, object]:
        return {"payload": await request.json()}

    return app


async def test_composed_middleware_wraps_trusted_host_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    """Response policy must wrap framework-level responses created before routing."""
    monkeypatch.setattr(settings, "allowed_hosts", ["api.example.test"])
    monkeypatch.setattr(settings, "allowed_origins", ["https://app.example.test"])
    monkeypatch.setattr(settings, "cors_origin_regex", None)
    monkeypatch.setattr(settings, "environment", Environment.STAGING)

    app = _create_composed_middleware_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://evil.example.test") as client:
        response = await client.get("/health")

    assert response.status_code == 400
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["strict-transport-security"] == HSTS_HEADER_VALUE


async def test_composed_middleware_exposes_request_id_through_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    """CORS should allow clients to read the request ID produced by the request middleware."""
    monkeypatch.setattr(settings, "allowed_hosts", ["*"])
    monkeypatch.setattr(settings, "allowed_origins", ["https://app.example.test"])
    monkeypatch.setattr(settings, "cors_origin_regex", None)

    app = _create_composed_middleware_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health", headers={"Origin": "https://app.example.test"})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER]
    assert response.headers["access-control-expose-headers"] == REQUEST_ID_HEADER


async def test_composed_middleware_keeps_api_guards(monkeypatch: pytest.MonkeyPatch) -> None:
    """Method policy, content negotiation, and request size limits should compose together."""
    monkeypatch.setattr(settings, "allowed_hosts", ["*"])
    monkeypatch.setattr(settings, "allowed_origins", ["https://app.example.test"])
    monkeypatch.setattr(settings, "cors_origin_regex", None)
    monkeypatch.setattr(settings, "request_body_limit_bytes", 8)

    app = _create_composed_middleware_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        method_response = await client.request("TRACE", "/health")
        negotiation_response = await client.get("/v1/json", headers={"Accept": "application/xml"})
        size_response = await client.post(
            "/v1/json",
            content=b'{"too":"large"}',
            headers={"Content-Type": "application/json"},
        )

    assert method_response.status_code == 405
    assert method_response.headers["allow"] == ALLOW_HEADER_VALUE
    assert negotiation_response.status_code == 406
    assert size_response.status_code == 413


async def test_composed_middleware_uses_shared_method_policy_for_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    """CORS and 405 Allow headers should be derived from the same method policy."""
    monkeypatch.setattr(settings, "allowed_hosts", ["*"])
    monkeypatch.setattr(settings, "allowed_origins", ["https://app.example.test"])
    monkeypatch.setattr(settings, "cors_origin_regex", None)

    app = _create_composed_middleware_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "https://app.example.test",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-methods"] == ", ".join(CORS_HTTP_METHODS)
