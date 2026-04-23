"""Real client IP extraction for requests arriving via Cloudflare Tunnel.

When cloudflared proxies traffic, ``request.client.host`` is always 127.0.0.1
(the local tunnel endpoint). The real client IP is forwarded by Cloudflare via
the ``CF-Connecting-IP`` header before the request enters the tunnel.

Security note: these headers are only safe to trust because cloudflared is the
*sole* entry point — the backend is not directly reachable from the internet.
If that changes (e.g. a port is accidentally exposed), header spoofing becomes
possible and this logic should be revisited.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from starlette.datastructures import Headers

# Ordered list of headers to try before falling back to the transport address.
_PROXY_HEADERS = ("CF-Connecting-IP", "X-Real-IP")


def extract_client_ip(headers: Headers, fallback: str = "unknown") -> str:
    """Return the real client IP from proxy-forwarded headers.

    Checks headers in priority order:
    1. ``CF-Connecting-IP`` — set by Cloudflare (most reliable behind cloudflared)
    2. ``X-Real-IP`` — set by nginx and other reverse proxies
    3. First entry of ``X-Forwarded-For``
    4. ``fallback`` — the raw transport address
    """
    for header in _PROXY_HEADERS:
        if ip := headers.get(header, "").strip():
            return ip

    forwarded_for = headers.get("X-Forwarded-For", "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return fallback


def get_client_ip(request: Request) -> str:
    """Rate-limiter key function returning the real client IP."""
    fallback = request.client.host if request.client else "unknown"
    return extract_client_ip(request.headers, fallback)
