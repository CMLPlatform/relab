"""Real client IP extraction for requests arriving through trusted proxies.

Proxy-forwarded client IP headers are only honored when the transport peer is
inside the configured trusted proxy CIDRs. Direct clients fall back to the raw
transport address so they cannot spoof rate-limit identity with headers.
"""

from __future__ import annotations

from functools import lru_cache
from ipaddress import IPv4Network, IPv6Network, ip_address, ip_network
from typing import TYPE_CHECKING

from fastapi import Request

from app.core.config import settings

if TYPE_CHECKING:
    from starlette.datastructures import Headers

# Ordered list of headers to try before falling back to the transport address.
_PROXY_HEADERS = ("CF-Connecting-IP", "X-Real-IP")


@lru_cache(maxsize=16)
def _trusted_proxy_networks(trusted_proxy_cidrs: tuple[str, ...]) -> tuple[IPv4Network | IPv6Network, ...]:
    """Return parsed trusted proxy networks."""
    return tuple(ip_network(cidr, strict=False) for cidr in trusted_proxy_cidrs)


def _valid_ip(value: str) -> str | None:
    """Return a normalized IP address string when value is valid."""
    try:
        return str(ip_address(value.strip()))
    except ValueError:
        return None


def _is_trusted_proxy(peer_ip: str, trusted_proxy_cidrs: tuple[str, ...]) -> bool:
    """Return whether the transport peer is allowed to set proxy headers."""
    try:
        parsed_ip = ip_address(peer_ip)
    except ValueError:
        return False
    return any(parsed_ip in network for network in _trusted_proxy_networks(trusted_proxy_cidrs))


def extract_client_ip(
    headers: Headers,
    fallback: str = "unknown",
    *,
    trusted_proxy_cidrs: tuple[str, ...] | None = None,
) -> str:
    """Return the real client IP from proxy-forwarded headers.

    Checks headers in priority order:
    1. ``CF-Connecting-IP`` — set by Cloudflare (most reliable behind cloudflared)
    2. ``X-Real-IP`` — set by nginx and other reverse proxies
    3. First entry of ``X-Forwarded-For``
    4. ``fallback`` — the raw transport address
    """
    trusted_cidrs = settings.trusted_proxy_cidrs if trusted_proxy_cidrs is None else trusted_proxy_cidrs
    if not _is_trusted_proxy(fallback, trusted_cidrs):
        return fallback

    for header in _PROXY_HEADERS:
        if ip := _valid_ip(headers.get(header, "")):
            return ip

    forwarded_for = headers.get("X-Forwarded-For", "").strip()
    if forwarded_for:
        for candidate in forwarded_for.split(","):
            if ip := _valid_ip(candidate):
                return ip

    return fallback


def get_client_ip(request: Request) -> str:
    """Rate-limiter key function returning the real client IP."""
    fallback = request.client.host if request.client else "unknown"
    return extract_client_ip(request.headers, fallback)
