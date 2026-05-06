"""Middleware for enforcing a global request body size limit."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers

from app.core.config import settings

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MULTIPART_FORM_DATA = "multipart/form-data"
BYTES_PER_MIB = 1024 * 1024
MULTIPART_FORM_OVERHEAD_BYTES = BYTES_PER_MIB
HTTP_SCOPE_TYPE = "http"
HTTP_REQUEST_MESSAGE_TYPE = "http.request"
HTTP_RESPONSE_START_MESSAGE_TYPE = "http.response.start"


class RequestBodyTooLargeError(Exception):
    """Raised internally when a streamed request crosses the configured byte limit."""


def _is_multipart_request(headers: Headers) -> bool:
    """Return True when the request should use route-specific multipart validation instead."""
    return headers.get("content-type", "").lower().startswith(MULTIPART_FORM_DATA)


def _payload_too_large_response(limit_bytes: int) -> JSONResponse:
    """Build the shared API error payload for oversized requests."""
    return JSONResponse(
        status_code=413,
        content={"detail": {"message": f"Request body too large. Maximum size: {limit_bytes} bytes"}},
    )


class RequestSizeLimitMiddleware:
    """ASGI middleware that caps request bodies while streaming."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Limit eligible HTTP request bodies before they are buffered by route handlers."""
        if scope["type"] != HTTP_SCOPE_TYPE:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        if scope["method"] in BODYLESS_METHODS:
            await self.app(scope, receive, send)
            return

        limit_bytes = _request_limit_bytes(headers)
        if _content_length_exceeds_limit(headers, limit_bytes):
            await _payload_too_large_response(limit_bytes)(scope, receive, send)
            return

        await self._call_with_stream_limit(scope, receive, send, limit_bytes)

    async def _call_with_stream_limit(self, scope: Scope, receive: Receive, send: Send, limit_bytes: int) -> None:
        """Call the downstream app with a receive wrapper that counts body bytes."""
        bytes_seen = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal bytes_seen
            message = await receive()
            if message["type"] != HTTP_REQUEST_MESSAGE_TYPE:
                return message

            bytes_seen += len(message.get("body", b""))
            if bytes_seen > limit_bytes:
                raise RequestBodyTooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == HTTP_RESPONSE_START_MESSAGE_TYPE:
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except RequestBodyTooLargeError:
            if not response_started:
                await _payload_too_large_response(limit_bytes)(scope, receive, send)


def _request_limit_bytes(headers: Headers) -> int:
    """Return the byte limit for the current request media type."""
    if _is_multipart_request(headers):
        return (settings.max_file_upload_size_mb * BYTES_PER_MIB) + MULTIPART_FORM_OVERHEAD_BYTES
    return settings.request_body_limit_bytes


def _content_length_exceeds_limit(headers: Headers, limit_bytes: int) -> bool:
    """Return whether a declared request length is already over the configured limit."""
    content_length = headers.get("content-length")
    return content_length is not None and int(content_length) > limit_bytes


def register_request_size_limit_middleware(app: FastAPI) -> None:
    """Attach middleware that caps request body size."""
    app.add_middleware(RequestSizeLimitMiddleware)
