"""Unit tests for OAuth client scope separation.

Tests verify our wiring (which client has which scopes, which client the router uses).
URL construction by httpx_oauth itself is not tested.
"""

from __future__ import annotations

from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES

from app.api.auth.config import settings
from app.api.auth.routers import oauth as oauth_router_module
from app.api.auth.services.oauth import (
    GOOGLE_YOUTUBE_SCOPES,
    google_oauth_client,
    google_youtube_oauth_client,
)


def test_google_login_client_uses_base_scopes_only() -> None:
    """Ensure the standard Google login client stays on the minimal login scope set."""
    youtube_scopes = set(settings.youtube_api_scopes or [])
    base_scopes = google_oauth_client.base_scopes or []
    assert google_oauth_client.base_scopes == GOOGLE_BASE_SCOPES
    assert youtube_scopes.isdisjoint(base_scopes)


def test_google_youtube_client_extends_login_scopes() -> None:
    """Ensure the plugin-only YouTube client keeps the elevated scope set separate."""
    youtube_scopes = set(settings.youtube_api_scopes or [])
    base_scopes = google_youtube_oauth_client.base_scopes or []
    assert google_youtube_oauth_client.base_scopes == GOOGLE_YOUTUBE_SCOPES
    assert set(GOOGLE_BASE_SCOPES).issubset(base_scopes)
    assert youtube_scopes.issubset(base_scopes)


def test_login_router_wiring_uses_standard_google_client() -> None:
    """Ensure the auth router is wired to the normal Google login client, not the YouTube client."""
    assert oauth_router_module.google_oauth_client is google_oauth_client
    assert oauth_router_module.google_oauth_client is not google_youtube_oauth_client
