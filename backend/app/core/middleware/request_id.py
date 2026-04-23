"""Request ID middleware and request-scoped logging helpers."""

from __future__ import annotations

from time import perf_counter
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import FastAPI, Request
from loguru import logger as loguru_logger

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint
    from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"
_MAX_REQUEST_ID_LENGTH = 255


def _normalize_request_id(header_value: str | None) -> str:
    """Return a safe request ID from the inbound header or generate a new one."""
    if header_value is None:
        return str(uuid4())

    normalized_value = header_value.strip()
    if not normalized_value:
        return str(uuid4())

    return normalized_value[:_MAX_REQUEST_ID_LENGTH]


def register_request_id_middleware(app: FastAPI) -> None:
    """Attach request ID propagation and access logging middleware to an app."""

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = _normalize_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id

        start_time = perf_counter()

        with loguru_logger.contextualize(
            request_id=request_id,
            http_method=request.method,
            http_path=request.url.path,
        ):
            response = await call_next(request)

            latency_ms = round((perf_counter() - start_time) * 1000, 2)
            response.headers[REQUEST_ID_HEADER] = request_id

            loguru_logger.bind(
                request_id=request_id,
                http_method=request.method,
                http_path=request.url.path,
                http_status_code=response.status_code,
                http_latency_ms=latency_ms,
            ).info("HTTP request completed")

            return response
