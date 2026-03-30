"""Unit tests for global request body size middleware."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.request_size import register_request_size_limit_middleware


def _create_test_app() -> FastAPI:
    app = FastAPI()
    register_request_size_limit_middleware(app)

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, object]:
        payload = await request.json()
        return {"payload": payload}

    @app.post("/multipart")
    async def multipart_probe(request: Request) -> dict[str, str]:
        return {"content_type": request.headers.get("content-type", "")}

    return app


@pytest.mark.anyio
async def test_request_size_limit_accepts_small_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON requests under the limit should pass through unchanged."""
    monkeypatch.setattr("app.core.request_size.settings.request_body_limit_bytes", 64)
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/echo", json={"ok": "yes"})

    assert response.status_code == 200
    assert response.json() == {"payload": {"ok": "yes"}}


@pytest.mark.anyio
async def test_request_size_limit_rejects_large_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON requests over the limit should receive a 413 response."""
    monkeypatch.setattr("app.core.request_size.settings.request_body_limit_bytes", 32)
    app = _create_test_app()
    body = json.dumps({"payload": "x" * 40}).encode()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/echo",
            content=body,
            headers={"content-type": "application/json", "content-length": str(len(body))},
        )

    assert response.status_code == 413
    assert response.json()["detail"]["message"] == "Request body too large. Maximum size: 32 bytes"


@pytest.mark.anyio
async def test_request_size_limit_skips_multipart_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Multipart requests should remain governed by route-specific upload validation."""
    monkeypatch.setattr("app.core.request_size.settings.request_body_limit_bytes", 8)
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/multipart",
            content=b"x" * 128,
            headers={"content-type": "multipart/form-data; boundary=test-boundary"},
        )

    assert response.status_code == 200
    assert response.json()["content_type"].startswith("multipart/form-data")
