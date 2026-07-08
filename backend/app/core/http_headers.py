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

# Session cookies set by the auth backend (see api/auth/services/auth_backends.py).
AUTH_COOKIE_NAMES = frozenset({"__Host-relab-auth", "__Host-relab-refresh"})


def request_has_auth_material(request: Request | None) -> bool:
    """Return whether a request carries user credentials (bearer token or session cookie)."""
    if request is None:
        return False
    if request.headers.get("authorization"):
        return True
    return any(cookie_name in request.cookies for cookie_name in AUTH_COOKIE_NAMES)
