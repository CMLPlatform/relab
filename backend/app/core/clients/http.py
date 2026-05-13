"""Shared HTTP client utilities for outbound network calls."""

from __future__ import annotations

from httpx import AsyncBaseTransport, AsyncClient, Limits, Request, RequestError, Timeout

from app.core.config import settings


def _normalized_policy_url(request: Request) -> str:
    """Return the request URL without query or fragment for policy matching."""
    return str(request.url.copy_with(query=None, fragment=None))


def _is_allowed_outbound_url(url: str) -> bool:
    """Return whether a normalized URL matches the configured exact or prefix allowlist."""
    for allowed_url in settings.outbound_http_allowed_urls:
        allowed = str(allowed_url)
        if allowed.endswith("/"):
            if url.startswith(allowed):
                return True
        elif url == allowed:
            return True
    return False


async def _enforce_outbound_url_allowlist(request: Request) -> None:
    """Block outbound HTTP requests outside the configured URL allowlist."""
    url = _normalized_policy_url(request)
    if not _is_allowed_outbound_url(url):
        msg = f"Outbound HTTP URL is not allowlisted: {url}"
        raise RequestError(msg, request=request)


def create_http_client(*, transport: AsyncBaseTransport | None = None) -> AsyncClient:
    """Create the shared outbound HTTP client."""
    limits = Limits(
        max_connections=settings.http_max_connections,
        max_keepalive_connections=settings.http_max_keepalive_connections,
    )
    return AsyncClient(
        http2=True,
        follow_redirects=False,
        trust_env=False,
        transport=transport,
        limits=limits,
        timeout=Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        headers={"User-Agent": "relab-backend"},
        event_hooks={"request": [_enforce_outbound_url_allowlist]},
    )
