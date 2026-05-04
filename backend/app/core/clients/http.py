"""Shared HTTP client utilities for outbound network calls."""

from httpx import AsyncClient, Limits, Timeout

from app.core.config import settings


def create_http_client() -> AsyncClient:
    """Create the shared outbound HTTP client."""
    return AsyncClient(
        http2=True,
        follow_redirects=False,
        trust_env=False,
        limits=Limits(
            max_connections=settings.http_max_connections,
            max_keepalive_connections=settings.http_max_keepalive_connections,
        ),
        timeout=Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        headers={"User-Agent": "relab-backend"},
    )
