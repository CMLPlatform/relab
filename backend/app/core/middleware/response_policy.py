"""HTTP response policy middleware for cache and browser security headers."""

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response

from app.core.http_headers import (
    NO_STORE,
    SENSITIVE_CACHE_CONTROL,
    SENSITIVE_CACHE_HEADERS,
    path_matches_prefix,
    request_has_auth_material,
)

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint

CACHE_CONTROL_HEADER = "cache-control"
PROBLEM_CONTENT_TYPE = "application/problem+json"
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
REFERRER_POLICY_HEADER_VALUE = "no-referrer"
CONTENT_SECURITY_POLICY_HEADER_VALUE = "default-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"
X_XSS_PROTECTION_HEADER_VALUE = "0"
CROSS_ORIGIN_OPENER_POLICY_HEADER_VALUE = "same-origin"
CROSS_ORIGIN_RESOURCE_POLICY_HEADER_VALUE = "same-site"
# Dev-only relaxation: the local web stack serves the app and API on different
# loopback ports (127.0.0.1:8011 / :8010), which browsers treat as cross-site,
# so "same-site" blocks gallery images with ERR_BLOCKED_BY_RESPONSE. Loopback
# origins carry no cross-origin confidentiality risk, so relax to "cross-origin"
# only when settings.debug (dev environment); staging/prod keep "same-site".
CROSS_ORIGIN_RESOURCE_POLICY_DEV_HEADER_VALUE = "cross-origin"
BASE_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": REFERRER_POLICY_HEADER_VALUE,
    "Content-Security-Policy": CONTENT_SECURITY_POLICY_HEADER_VALUE,
    "X-XSS-Protection": X_XSS_PROTECTION_HEADER_VALUE,
    "Cross-Origin-Opener-Policy": CROSS_ORIGIN_OPENER_POLICY_HEADER_VALUE,
}


def _is_sensitive_path(path: str) -> bool:
    """Return whether the path commonly carries sensitive API data."""
    return any(path_matches_prefix(path, prefix) for prefix in SENSITIVE_PATH_PREFIXES)


def _is_problem_details(response: Response) -> bool:
    """Return whether a response is a Problem Details payload."""
    return response.headers.get("content-type", "").lower().startswith(PROBLEM_CONTENT_TYPE)


def _should_apply_sensitive_cache_policy(request: Request, response: Response) -> bool:
    """Return whether the response should opt out of cache storage."""
    return request_has_auth_material(request) or _is_sensitive_path(request.url.path) or _is_problem_details(response)


def _set_sensitive_cache_headers(response: Response) -> None:
    """Set legacy-compatible no-cache headers for sensitive responses."""
    if response.headers.get(CACHE_CONTROL_HEADER) in (None, NO_STORE):
        response.headers["Cache-Control"] = SENSITIVE_CACHE_CONTROL
    for name, value in SENSITIVE_CACHE_HEADERS.items():
        if name.lower() != CACHE_CONTROL_HEADER:
            response.headers.setdefault(name, value)


def register_response_policy_middleware(
    app: FastAPI, *, enable_hsts: bool, allow_dev_cross_origin: bool = False
) -> None:
    """Register response-only cache and browser security policy."""
    cross_origin_resource_policy = (
        CROSS_ORIGIN_RESOURCE_POLICY_DEV_HEADER_VALUE
        if allow_dev_cross_origin
        else CROSS_ORIGIN_RESOURCE_POLICY_HEADER_VALUE
    )

    @app.middleware("http")
    async def response_policy_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if _should_apply_sensitive_cache_policy(request, response):
            _set_sensitive_cache_headers(response)
        for name, value in BASE_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        response.headers.setdefault("Cross-Origin-Resource-Policy", cross_origin_resource_policy)
        if enable_hsts:
            response.headers["Strict-Transport-Security"] = HSTS_HEADER_VALUE
        return response
