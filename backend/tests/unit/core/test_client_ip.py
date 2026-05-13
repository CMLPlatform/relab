"""Tests for trusted proxy client IP extraction."""

from __future__ import annotations

from starlette.datastructures import Headers

from app.core.middleware.client_ip import extract_client_ip


def test_extract_client_ip_uses_proxy_header_from_trusted_peer() -> None:
    """Proxy-set client headers should be honored only from trusted peers."""
    headers = Headers({"CF-Connecting-IP": "203.0.113.10"})

    assert extract_client_ip(headers, "172.18.0.5", trusted_proxy_cidrs=("172.16.0.0/12",)) == "203.0.113.10"


def test_extract_client_ip_ignores_spoofed_proxy_header_from_untrusted_peer() -> None:
    """Direct clients should not be able to spoof rate-limit identity."""
    headers = Headers({"CF-Connecting-IP": "203.0.113.10", "X-Forwarded-For": "198.51.100.7"})

    assert extract_client_ip(headers, "198.51.100.20", trusted_proxy_cidrs=("172.16.0.0/12",)) == "198.51.100.20"


def test_extract_client_ip_uses_first_forwarded_for_from_trusted_peer() -> None:
    """X-Forwarded-For should use the original client entry when the peer is trusted."""
    headers = Headers({"X-Forwarded-For": "203.0.113.10, 172.18.0.5"})

    assert extract_client_ip(headers, "127.0.0.1", trusted_proxy_cidrs=("127.0.0.0/8",)) == "203.0.113.10"


def test_extract_client_ip_ignores_malformed_proxy_header_from_trusted_peer() -> None:
    """Trusted proxy headers should still contain a valid IP address."""
    headers = Headers({"CF-Connecting-IP": "not an ip", "X-Forwarded-For": "203.0.113.10"})

    assert extract_client_ip(headers, "127.0.0.1", trusted_proxy_cidrs=("127.0.0.0/8",)) == "203.0.113.10"


def test_extract_client_ip_default_trust_is_loopback_only() -> None:
    """Default proxy trust should not cover broad private networks."""
    headers = Headers({"CF-Connecting-IP": "203.0.113.10"})

    assert extract_client_ip(headers, "172.18.0.5") == "172.18.0.5"
