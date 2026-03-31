"""Unit tests for request ID middleware."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.middleware.request_id import REQUEST_ID_HEADER, register_request_id_middleware

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


def _create_test_app() -> FastAPI:
    app = FastAPI()
    register_request_id_middleware(app)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


@pytest.mark.anyio
async def test_request_id_middleware_generates_response_header(mocker: MockerFixture) -> None:
    """Requests without an ID should receive a generated request ID."""
    bind_logger = MagicMock()
    bind_logger.info = MagicMock()
    bind_mock = mocker.patch("app.core.middleware.request_id.loguru_logger.bind", return_value=bind_logger)

    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert response.status_code == 200
    assert REQUEST_ID_HEADER in response.headers
    assert response.headers[REQUEST_ID_HEADER]

    request_log_calls = [call.kwargs for call in bind_mock.call_args_list if "request_id" in call.kwargs]
    assert len(request_log_calls) == 1

    bind_kwargs = request_log_calls[0]
    assert bind_kwargs["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert bind_kwargs["http_method"] == "GET"
    assert bind_kwargs["http_path"] == "/ping"
    assert bind_kwargs["http_status_code"] == 200
    assert bind_kwargs["http_latency_ms"] >= 0
    bind_logger.info.assert_called_once_with("HTTP request completed")


@pytest.mark.anyio
async def test_request_id_middleware_preserves_incoming_header(mocker: MockerFixture) -> None:
    """Requests with an ID should echo the same request ID back to callers."""
    bind_logger = MagicMock()
    bind_logger.info = MagicMock()
    bind_mock = mocker.patch("app.core.middleware.request_id.loguru_logger.bind", return_value=bind_logger)

    app = _create_test_app()
    request_id = "frontend-request-123"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping", headers={REQUEST_ID_HEADER: request_id})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] == request_id
    request_log_calls = [call.kwargs for call in bind_mock.call_args_list if "request_id" in call.kwargs]
    assert len(request_log_calls) == 1
    assert request_log_calls[0]["request_id"] == request_id
