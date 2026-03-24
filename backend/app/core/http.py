"""Shared HTTP client utilities for outbound network calls."""

from httpx import AsyncClient, Limits, Timeout


def create_http_client() -> AsyncClient:
    """Create the shared outbound HTTP client."""
    return AsyncClient(
        http2=True,
        limits=Limits(max_connections=100, max_keepalive_connections=20),
        timeout=Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        headers={"User-Agent": "relab-backend/0.1"},
    )
