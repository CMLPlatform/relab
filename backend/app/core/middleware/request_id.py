"""Request ID middleware and request-scoped logging helpers."""

import logging
import re
from time import perf_counter
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import FastAPI, Request

from app.core.http_headers import REQUEST_ID_HEADER
from app.core.logging import log_context

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint
    from starlette.responses import Response

logger = logging.getLogger(__name__)

# A client-supplied request ID is logged on every line for the request and echoed back
# verbatim in the response header. Restrict it to the same safe charset our own
# generated IDs use, rather than merely stripping CR/LF: an unrestricted value could
# still smuggle other log-formatting or header-injection-adjacent characters through.
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _normalize_request_id(header_value: str | None) -> str:
    """Return a safe request ID from the inbound header or generate a new one."""
    if header_value is None:
        return str(uuid4())

    normalized_value = header_value.strip()
    if not _REQUEST_ID_PATTERN.fullmatch(normalized_value):
        return str(uuid4())

    return normalized_value


def register_request_id_middleware(app: FastAPI) -> None:
    """Attach request ID propagation and access logging middleware to an app."""

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = _normalize_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id

        start_time = perf_counter()

        with log_context(
            request_id=request_id,
            http_method=request.method,
            http_path=request.url.path,
        ):
            response = await call_next(request)

            latency_ms = round((perf_counter() - start_time) * 1000, 2)
            response.headers[REQUEST_ID_HEADER] = request_id

            logger.info(
                "HTTP request completed",
                extra={
                    "http_status_code": response.status_code,
                    "http_latency_ms": latency_ms,
                },
            )

            return response
