"""Shared HTTP header/cookie constants and request helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.requests import Request

NO_STORE = "no-store"
SENSITIVE_CACHE_CONTROL = "no-store, no-cache, must-revalidate"
SENSITIVE_CACHE_HEADERS = {
    "Cache-Control": SENSITIVE_CACHE_CONTROL,
    "Pragma": "no-cache",
    "Expires": "0",
}
REQUEST_ID_HEADER = "X-Request-ID"
# Opt-in retry key on create endpoints (api/common/idempotency.py). Must stay in the
# CORS allow-list, or the browser preflight for every guarded POST fails.
IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"

# Mount prefix for uploaded-media StaticFiles routes. Single source of truth: app/core/static.py
# mounts "<prefix>/files" and "<prefix>/images" under it, and app/core/images/urls.py derives
# IMAGE_URL_PREFIX from it.
UPLOADS_PATH_PREFIX = "/uploads"

# Session cookie names — single source of truth, consumed by the auth backend
# (api/auth/services/auth_backends.py). Host-only (`__Host-` prefix) so credentials
# never leak to sibling subdomains.
AUTH_COOKIE_NAME = "__Host-relab-auth"
REFRESH_COOKIE_NAME = "__Host-relab-refresh"
AUTH_COOKIE_NAMES = frozenset({AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME})


def request_has_auth_material(request: Request | None) -> bool:
    """Return whether a request carries user credentials (bearer token or session cookie)."""
    if request is None:
        return False
    if request.headers.get("authorization"):
        return True
    return any(cookie_name in request.cookies for cookie_name in AUTH_COOKIE_NAMES)


def path_matches_prefix(path: str, prefix: str) -> bool:
    """Return whether path is exactly prefix or a child path."""
    return path == prefix or path.startswith(f"{prefix}/")
