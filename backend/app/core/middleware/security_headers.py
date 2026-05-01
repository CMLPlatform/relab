"""HTTP security response headers for the backend."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint

HSTS_HEADER_VALUE = "max-age=63072000; includeSubDomains"
REFERRER_POLICY_HEADER_VALUE = "strict-origin-when-cross-origin"
CONTENT_SECURITY_POLICY_HEADER_VALUE = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"


def register_security_headers_middleware(app: FastAPI, *, enable_hsts: bool) -> None:
    """Register security headers that belong at the backend response boundary."""

    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", REFERRER_POLICY_HEADER_VALUE)
        response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY_HEADER_VALUE)
        if enable_hsts:
            response.headers["Strict-Transport-Security"] = HSTS_HEADER_VALUE
        return response
