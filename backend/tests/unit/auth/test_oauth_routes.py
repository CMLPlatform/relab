"""Unit tests for OAuth router composition helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

from fastapi import APIRouter
from pydantic import HttpUrl

from app.api.auth.services.oauth import routes

if TYPE_CHECKING:
    import pytest


def test_public_callback_url_uses_configured_backend_base(monkeypatch: pytest.MonkeyPatch) -> None:
    """Public OAuth callbacks should be built from the configured backend URL."""
    monkeypatch.setattr(
        "app.api.auth.services.oauth.routes.core_settings.api_public_url",
        HttpUrl("https://api-test.cml-relab.org"),
    )

    assert routes.public_callback_url(f"{routes.PUBLIC_OAUTH_CALLBACK_PREFIX}/google/associate/callback") == (
        "https://api-test.cml-relab.org/v1/oauth/google/associate/callback"
    )


def test_include_oauth_routes_uses_dedicated_state_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """OAuth route builders should receive OAUTH_STATE_SECRET, not AUTH_TOKEN_SECRET."""
    captured_state_secrets: list[str] = []
    captured_oauth_flows: list[str] = []

    def fake_login_builder(*args: object, **kwargs: object) -> APIRouter:
        captured_oauth_flows.append(str(kwargs["oauth_flow"]))
        captured_state_secrets.append(str(args[2]))
        return APIRouter()

    def fake_associate_builder(*args: object, **kwargs: object) -> APIRouter:
        captured_oauth_flows.append(str(kwargs["oauth_flow"]))
        captured_state_secrets.append(str(args[3]))
        return APIRouter()

    monkeypatch.setattr(routes.settings.auth_token_secret, "get_secret_value", lambda: "auth-secret")
    monkeypatch.setattr(routes.settings.oauth_state_secret, "get_secret_value", lambda: "state-secret")
    monkeypatch.setattr(routes, "build_oauth_login_router", fake_login_builder)
    monkeypatch.setattr(routes, "build_oauth_associate_router", fake_associate_builder)
    monkeypatch.setattr(routes, "github_oauth_client", MagicMock())
    routes.github_oauth_client.name = "github"
    monkeypatch.setattr(routes, "google_oauth_client", MagicMock())
    routes.google_oauth_client.name = "google"
    monkeypatch.setattr(routes, "google_youtube_oauth_client", MagicMock())
    routes.google_youtube_oauth_client.name = "google"

    routes.include_oauth_routes(APIRouter(), public_callback_prefix=routes.PUBLIC_OAUTH_CALLBACK_PREFIX)

    assert captured_state_secrets
    assert set(captured_state_secrets) == {"state-secret"}
    assert set(captured_oauth_flows) == {
        "github:token",
        "github:session",
        "github:associate",
        "google:token",
        "google:session",
        "google:associate",
        "google-youtube:associate",
    }
