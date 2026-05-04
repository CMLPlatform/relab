"""HTTP response policy middleware for cache and browser security headers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint

NO_STORE = "no-store"
CACHE_CONTROL_HEADER = "cache-control"
PROBLEM_CONTENT_TYPE = "application/problem+json"
AUTH_COOKIE_NAMES = frozenset({"auth", "refresh_token"})
SENSITIVE_PATH_PREFIXES = (
    "/v1/auth",
    "/v1/oauth",
    "/v1/users",
    "/v1/admin",
    "/v1/plugins/rpi-cam/pairing",
    "/v1/plugins/rpi-cam/cameras",
    "/v1/plugins/rpi-cam/device",
)

HSTS_HEADER_VALUE = "max-age=63072000; includeSubDomains"
REFERRER_POLICY_HEADER_VALUE = "strict-origin-when-cross-origin"
CONTENT_SECURITY_POLICY_HEADER_VALUE = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)
X_XSS_PROTECTION_HEADER_VALUE = "0"
BASE_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": REFERRER_POLICY_HEADER_VALUE,
    "Content-Security-Policy": CONTENT_SECURITY_POLICY_HEADER_VALUE,
    "X-XSS-Protection": X_XSS_PROTECTION_HEADER_VALUE,
}


def _path_matches_prefix(path: str, prefix: str) -> bool:
    """Return whether path is exactly prefix or a child path."""
    return path == prefix or path.startswith(f"{prefix}/")


def _has_auth_material(request: Request) -> bool:
    """Return whether a request carries RELab credentials."""
    if request.headers.get("authorization"):
        return True
    return any(cookie_name in request.cookies for cookie_name in AUTH_COOKIE_NAMES)


def _is_sensitive_path(path: str) -> bool:
    """Return whether the path commonly carries sensitive API data."""
    return any(_path_matches_prefix(path, prefix) for prefix in SENSITIVE_PATH_PREFIXES)


def _is_problem_details(response: Response) -> bool:
    """Return whether a response is a Problem Details payload."""
    return response.headers.get("content-type", "").lower().startswith(PROBLEM_CONTENT_TYPE)


def _should_set_no_store(request: Request, response: Response) -> bool:
    """Return whether the response should opt out of cache storage."""
    return _has_auth_material(request) or _is_sensitive_path(request.url.path) or _is_problem_details(response)


def register_response_policy_middleware(app: FastAPI, *, enable_hsts: bool) -> None:
    """Register response-only cache and browser security policy."""

    @app.middleware("http")
    async def response_policy_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if _should_set_no_store(request, response) and CACHE_CONTROL_HEADER not in response.headers:
            response.headers["Cache-Control"] = NO_STORE
        for name, value in BASE_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if enable_hsts:
            response.headers["Strict-Transport-Security"] = HSTS_HEADER_VALUE
        return response
