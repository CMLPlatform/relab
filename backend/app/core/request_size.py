"""Middleware for enforcing a global request body size limit."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from starlette.responses import Response
    from starlette.types import Message

BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MULTIPART_FORM_DATA = "multipart/form-data"


def _is_multipart_request(request: Request) -> bool:
    """Return True when the request should use route-specific multipart validation instead."""
    return request.headers.get("content-type", "").lower().startswith(MULTIPART_FORM_DATA)


def _payload_too_large_response(limit_bytes: int) -> JSONResponse:
    """Build the shared API error payload for oversized requests."""
    return JSONResponse(
        status_code=413,
        content={"detail": {"message": f"Request body too large. Maximum size: {limit_bytes} bytes"}},
    )


def register_request_size_limit_middleware(app: FastAPI) -> None:
    """Attach middleware that caps non-multipart request body size."""

    @app.middleware("http")
    async def request_size_limit_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.method in BODYLESS_METHODS or _is_multipart_request(request):
            return await call_next(request)

        limit_bytes = settings.request_body_limit_bytes

        content_length = request.headers.get("content-length")
        if content_length is not None and int(content_length) > limit_bytes:
            return _payload_too_large_response(limit_bytes)

        body = await request.body()
        if len(body) > limit_bytes:
            return _payload_too_large_response(limit_bytes)

        async def receive() -> Message:
            return {
                "type": "http.request",
                "body": body,
                "more_body": False,
            }

        request._receive = receive  # noqa: SLF001 # Starlette's documented request-body replay pattern
        return await call_next(request)
