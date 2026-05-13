"""Global HTTP method policy middleware."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Response

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

HTTP_SCOPE_TYPE = "http"
HEAD_METHOD = "HEAD"
SUPPORTED_HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
CORS_HTTP_METHODS = tuple(method for method in SUPPORTED_HTTP_METHODS if method != HEAD_METHOD)
DISALLOWED_HTTP_METHODS = frozenset({"TRACE", "TRACK", "CONNECT"})
ALLOW_HEADER_VALUE = ", ".join(SUPPORTED_HTTP_METHODS)


class MethodPolicyMiddleware:
    """Block dangerous HTTP methods that RELab does not support."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Reject disallowed methods before routing."""
        if scope["type"] == HTTP_SCOPE_TYPE and scope["method"].upper() in DISALLOWED_HTTP_METHODS:
            response = Response(status_code=405, headers={"Allow": ALLOW_HEADER_VALUE})
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


def register_method_policy_middleware(app: FastAPI) -> None:
    """Attach middleware that blocks dangerous unsupported HTTP methods."""
    app.add_middleware(MethodPolicyMiddleware)
