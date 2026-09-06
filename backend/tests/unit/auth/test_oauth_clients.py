"""Unit tests for OAuth client scope separation.

Tests verify our wiring (which client has which scopes, which client the router uses).
URL construction by httpx_oauth itself is not tested.
"""

import httpx
import pytest
from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES
from httpx_oauth.exceptions import GetIdEmailError

from app.api.auth.services.oauth import routes as oauth_routes
from app.api.auth.services.oauth.clients import (
    GOOGLE_YOUTUBE_SCOPES,
    YOUTUBE_API_SCOPES,
    github_oauth_client,
    google_oauth_client,
    google_youtube_oauth_client,
)


def test_google_login_client_uses_base_scopes_only() -> None:
    """Ensure the standard Google login client stays on the minimal login scope set."""
    youtube_scopes = set(YOUTUBE_API_SCOPES)
    base_scopes = google_oauth_client.base_scopes or []
    assert google_oauth_client.base_scopes == GOOGLE_BASE_SCOPES
    assert youtube_scopes.isdisjoint(base_scopes)


def test_google_youtube_client_extends_login_scopes() -> None:
    """Ensure the plugin-only YouTube client keeps the elevated scope set separate."""
    youtube_scopes = set(YOUTUBE_API_SCOPES)
    base_scopes = google_youtube_oauth_client.base_scopes or []
    assert google_youtube_oauth_client.base_scopes == GOOGLE_YOUTUBE_SCOPES
    assert set(GOOGLE_BASE_SCOPES).issubset(base_scopes)
    assert youtube_scopes.issubset(base_scopes)


def test_login_router_wiring_uses_standard_google_client() -> None:
    """Ensure the auth router is wired to the normal Google login client, not the YouTube client."""
    assert oauth_routes.google_oauth_client is google_oauth_client
    assert oauth_routes.google_oauth_client is not google_youtube_oauth_client


async def test_oauth_clients_use_shared_outbound_http_policy() -> None:
    """OAuth provider calls should use Relab's shared HTTP client configuration."""
    for client in (google_oauth_client, google_youtube_oauth_client, github_oauth_client):
        http_client = client.get_httpx_client()
        try:
            assert http_client.trust_env is False
        finally:
            await http_client.aclose()


def _profile_response(payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload)


def _mock_transport(monkeypatch: pytest.MonkeyPatch, *responses: httpx.Response) -> None:
    """Serve ``responses`` in order to every provider call made through the shared client."""
    remaining = list(responses)
    transport = httpx.MockTransport(lambda _request: remaining.pop(0))
    monkeypatch.setattr(
        "app.api.auth.services.oauth.clients.create_http_client",
        lambda: httpx.AsyncClient(transport=transport),
    )


GOOGLE_PROFILE_ID = "people/12345"
GITHUB_PROFILE_ID = 12345


async def test_google_login_refuses_an_unverified_primary_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """``associate_by_email`` links accounts on this address, so an unverified one must not pass.

    Returning it would let anyone who can prove control of a Google account with a
    stranger's address set as an unverified primary take over that Relab account.
    """
    _mock_transport(
        monkeypatch,
        _profile_response(
            {
                "resourceName": GOOGLE_PROFILE_ID,
                "emailAddresses": [{"value": "victim@example.com", "metadata": {"primary": True}}],
            }
        ),
    )

    assert await google_oauth_client.get_id_email("token") == (GOOGLE_PROFILE_ID, None)


async def test_google_login_accepts_a_verified_primary_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """A primary address Google marks verified is the one real logins carry."""
    _mock_transport(
        monkeypatch,
        _profile_response(
            {
                "resourceName": GOOGLE_PROFILE_ID,
                "emailAddresses": [{"value": "someone@example.com", "metadata": {"primary": True, "verified": True}}],
            }
        ),
    )

    assert await google_oauth_client.get_id_email("token") == (GOOGLE_PROFILE_ID, "someone@example.com")


async def test_github_login_refuses_an_unverified_primary_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """``is_verified_by_default`` trusts this address, so an unverified one must not pass."""
    _mock_transport(
        monkeypatch,
        _profile_response({"id": GITHUB_PROFILE_ID}),
        _profile_response([{"email": "victim@example.com", "primary": True, "verified": False}]),
    )

    assert await github_oauth_client.get_id_email("token") == (str(GITHUB_PROFILE_ID), None)


async def test_github_login_ignores_a_verified_address_that_is_not_primary(monkeypatch: pytest.MonkeyPatch) -> None:
    """The library falls back to the first address when none is primary; ours must not."""
    _mock_transport(
        monkeypatch,
        _profile_response({"id": GITHUB_PROFILE_ID}),
        _profile_response(
            [
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "unverified@example.com", "primary": True, "verified": False},
            ]
        ),
    )

    assert await github_oauth_client.get_id_email("token") == (str(GITHUB_PROFILE_ID), None)


async def test_github_login_accepts_a_verified_primary_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """A verified primary address is the one real logins carry."""
    _mock_transport(
        monkeypatch,
        _profile_response({"id": GITHUB_PROFILE_ID}),
        _profile_response([{"email": "someone@example.com", "primary": True, "verified": True}]),
    )

    assert await github_oauth_client.get_id_email("token") == (str(GITHUB_PROFILE_ID), "someone@example.com")


async def test_github_login_reports_a_failed_profile_fetch_as_an_id_email_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A provider outage must surface as the library's error type, not a raw HTTP failure."""
    _mock_transport(monkeypatch, httpx.Response(503))

    with pytest.raises(GetIdEmailError):
        await github_oauth_client.get_id_email("token")
