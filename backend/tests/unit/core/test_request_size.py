"""Unit tests for global request body size middleware."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.middleware.request_size import register_request_size_limit_middleware

if TYPE_CHECKING:
    import pytest
    from starlette.types import Message


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


async def test_request_size_limit_accepts_small_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON requests under the limit should pass through unchanged."""
    monkeypatch.setattr("app.core.middleware.request_size.settings.request_body_limit_bytes", 64)
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/echo", json={"ok": "yes"})

    assert response.status_code == 200
    assert response.json() == {"payload": {"ok": "yes"}}


async def test_request_size_limit_rejects_large_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON requests over the limit should receive a 413 response."""
    monkeypatch.setattr("app.core.middleware.request_size.settings.request_body_limit_bytes", 32)
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


async def test_request_size_limit_rejects_streaming_body_before_buffering_all_chunks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Chunked requests should be rejected as soon as the running byte count crosses the limit."""
    monkeypatch.setattr("app.core.middleware.request_size.settings.request_body_limit_bytes", 8)
    app = _create_test_app()
    chunks = [b"1234", b"5678", b"9", b"this-should-not-be-read"]
    received_chunks = 0
    sent_messages: list[Message] = []

    async def receive() -> Message:
        nonlocal received_chunks
        if received_chunks >= len(chunks):
            return {"type": "http.request", "body": b"", "more_body": False}
        chunk = chunks[received_chunks]
        received_chunks += 1
        return {
            "type": "http.request",
            "body": chunk,
            "more_body": received_chunks < len(chunks),
        }

    async def send(message: Message) -> None:
        sent_messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/echo",
        "raw_path": b"/echo",
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
        "root_path": "",
    }

    await app(scope, receive, send)

    assert received_chunks == 3
    assert any(message["type"] == "http.response.start" and message["status"] == 413 for message in sent_messages)


async def test_request_size_limit_accepts_multipart_requests_under_upload_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    """Multipart requests under the derived upload cap should pass through."""
    monkeypatch.setattr("app.core.middleware.request_size.settings.request_body_limit_bytes", 8)
    monkeypatch.setattr("app.core.middleware.request_size.settings.max_file_upload_size_mb", 1)
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/multipart",
            content=b"x" * 128,
            headers={"content-type": "multipart/form-data; boundary=test-boundary"},
        )

    assert response.status_code == 200
    assert response.json()["content_type"].startswith("multipart/form-data")


async def test_request_size_limit_rejects_multipart_requests_over_upload_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    """Multipart requests over the derived upload cap should be rejected before parsing."""
    monkeypatch.setattr("app.core.middleware.request_size.settings.max_file_upload_size_mb", 1)
    app = _create_test_app()
    limit_bytes = (1024 * 1024) + (1024 * 1024)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/multipart",
            content=b"x" * (limit_bytes + 1),
            headers={
                "content-type": "multipart/form-data; boundary=test-boundary",
                "content-length": str(limit_bytes + 1),
            },
        )

    assert response.status_code == 413
    assert response.json()["detail"]["message"] == f"Request body too large. Maximum size: {limit_bytes} bytes"
