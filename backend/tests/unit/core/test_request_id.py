"""Unit tests for request ID middleware."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.middleware.request_id import REQUEST_ID_HEADER, register_request_id_middleware

if TYPE_CHECKING:
    import logging

    import pytest


def _record_value(record: logging.LogRecord, key: str) -> object:
    return getattr(record, key)


def _create_test_app() -> FastAPI:
    app = FastAPI()
    register_request_id_middleware(app)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


async def test_request_id_middleware_generates_response_header(caplog: pytest.LogCaptureFixture) -> None:
    """Requests without an ID should receive a generated request ID."""
    app = _create_test_app()

    with caplog.at_level("INFO", logger="app.core.middleware.request_id"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/ping")

    assert response.status_code == 200
    assert REQUEST_ID_HEADER in response.headers
    assert response.headers[REQUEST_ID_HEADER]

    record = next(record for record in caplog.records if record.message == "HTTP request completed")
    assert _record_value(record, "request_id") == response.headers[REQUEST_ID_HEADER]
    assert _record_value(record, "http_method") == "GET"
    assert _record_value(record, "http_path") == "/ping"
    assert _record_value(record, "http_status_code") == 200
    latency_ms = _record_value(record, "http_latency_ms")
    assert isinstance(latency_ms, int | float)
    assert latency_ms >= 0


async def test_request_id_middleware_preserves_incoming_header(caplog: pytest.LogCaptureFixture) -> None:
    """Requests with an ID should echo the same request ID back to callers."""
    app = _create_test_app()
    request_id = "frontend-request-123"

    with caplog.at_level("INFO", logger="app.core.middleware.request_id"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/ping", headers={REQUEST_ID_HEADER: request_id})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] == request_id
    record = next(record for record in caplog.records if record.message == "HTTP request completed")
    assert _record_value(record, "request_id") == request_id
