"""Tests for shared outbound HTTP client configuration."""

import httpx
import pytest

from app.core.clients.http import create_http_client


async def test_create_http_client_uses_ssrf_hardened_defaults() -> None:
    """The shared outbound client should not follow redirects or ambient proxies."""
    client = create_http_client()
    try:
        assert client.follow_redirects is False
        assert client.trust_env is False
    finally:
        await client.aclose()


async def test_create_http_client_registers_allowlist_hook_and_timeout() -> None:
    """The shared client should enforce allowlisting through HTTPX's request hooks."""
    client = create_http_client()
    try:
        assert client.event_hooks["request"]
        assert isinstance(client.timeout, httpx.Timeout)
    finally:
        await client.aclose()


async def test_outbound_allowlist_allows_configured_prefixes() -> None:
    """Allowlisted URL prefixes should reach the configured transport."""
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"ok": True}, request=request)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        response = await client.get("https://api.pwnedpasswords.com/range/ABCDE")

    assert response.status_code == 200
    assert seen == ["https://api.pwnedpasswords.com/range/ABCDE"]


async def test_outbound_allowlist_allows_exact_github_api_endpoint() -> None:
    """The GitHub profile endpoint should be allowed without opening all GitHub API paths."""
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"ok": True}, request=request)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        response = await client.get("https://api.github.com/user?per_page=1")

    assert response.status_code == 200
    assert seen == ["https://api.github.com/user?per_page=1"]


async def test_outbound_allowlist_blocks_sibling_github_api_paths_before_network() -> None:
    """Exact GitHub API allowlist entries should not permit sibling paths."""

    async def handler(request: httpx.Request) -> httpx.Response:
        msg = f"unexpected network call to {request.url}"
        raise AssertionError(msg)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.RequestError, match=r"api\.github\.com/repos"):
            await client.get("https://api.github.com/repos/owner/repo")


async def test_outbound_allowlist_limits_raw_github_to_disposable_domain_source() -> None:
    """Raw GitHub should only be reachable for the exact committed blocklist source."""
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, text="example.test\n", request=request)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        response = await client.get(
            "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"
        )

    assert response.status_code == 200
    assert seen == ["https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"]


async def test_outbound_allowlist_blocks_other_raw_github_paths_before_network() -> None:
    """The raw GitHub allowlist entry should not permit arbitrary repositories."""

    async def handler(request: httpx.Request) -> httpx.Response:
        msg = f"unexpected network call to {request.url}"
        raise AssertionError(msg)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.RequestError, match=r"raw\.githubusercontent\.com"):
            await client.get("https://raw.githubusercontent.com/other/project/main/payload.txt")


async def test_outbound_allowlist_ignores_query_string_for_policy_match() -> None:
    """Query strings should not affect exact URL policy decisions."""
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"ok": True}, request=request)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        response = await client.get("https://api.github.com/user?redirect=https://evil.example")

    assert response.status_code == 200
    assert seen == ["https://api.github.com/user?redirect=https://evil.example"]


async def test_outbound_allowlist_blocks_unconfigured_hosts_before_network() -> None:
    """Non-allowlisted hosts should fail before the transport sees the request."""

    async def handler(request: httpx.Request) -> httpx.Response:
        msg = f"unexpected network call to {request.url}"
        raise AssertionError(msg)

    async with create_http_client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.RequestError, match=r"evil\.example"):
            await client.get("https://evil.example/range/ABCDE")
