"""Tests for shared outbound HTTP client configuration."""

from app.core.clients.http import create_http_client


async def test_create_http_client_uses_ssrf_hardened_defaults() -> None:
    """The shared outbound client should not follow redirects or ambient proxies."""
    client = create_http_client()
    try:
        assert client.follow_redirects is False
        assert client.trust_env is False
    finally:
        await client.aclose()
