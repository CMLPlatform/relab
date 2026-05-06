"""Unit tests for OAuth router wiring."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter
from pydantic import HttpUrl

from app.api.auth.routers import oauth
from app.api.auth.routers.oauth import PUBLIC_OAUTH_CALLBACK_PREFIX, _include_oauth_routes, _public_callback_url

if TYPE_CHECKING:
    import pytest


def test_public_callback_url_uses_configured_backend_base(monkeypatch: pytest.MonkeyPatch) -> None:
    """Public OAuth callbacks should be built from the configured backend URL."""
    monkeypatch.setattr(
        "app.api.auth.routers.oauth.core_settings.backend_api_url",
        HttpUrl("https://api-test.cml-relab.org"),
    )

    assert _public_callback_url(f"{PUBLIC_OAUTH_CALLBACK_PREFIX}/google/associate/callback") == (
        "https://api-test.cml-relab.org/v1/oauth/google/associate/callback"
    )


def test_public_callback_url_normalizes_slashes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Callback URL construction should be stable regardless of input slashes."""
    monkeypatch.setattr(
        "app.api.auth.routers.oauth.core_settings.backend_api_url",
        HttpUrl("https://api-test.cml-relab.org/"),
    )

    assert _public_callback_url(f"{PUBLIC_OAUTH_CALLBACK_PREFIX}/google/session/callback") == (
        "https://api-test.cml-relab.org/v1/oauth/google/session/callback"
    )


def test_oauth_routes_use_dedicated_state_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """OAuth route builders should receive OAUTH_STATE_SECRET, not AUTH_TOKEN_SECRET."""
    captured_state_secrets: list[str] = []

    class FakeBuilder:
        def __init__(self, *args: object, **kwargs: object) -> None:
            del kwargs
            captured_state_secrets.append(str(args[2]))

        def build(self) -> APIRouter:
            return APIRouter()

    class FakeAssociateBuilder:
        def __init__(self, *args: object, **kwargs: object) -> None:
            del kwargs
            captured_state_secrets.append(str(args[3]))

        def build(self) -> APIRouter:
            return APIRouter()

    monkeypatch.setattr(oauth.settings.auth_token_secret, "get_secret_value", lambda: "auth-secret")
    monkeypatch.setattr(oauth.settings.oauth_state_secret, "get_secret_value", lambda: "state-secret")
    monkeypatch.setattr(oauth, "CustomOAuthRouterBuilder", FakeBuilder)
    monkeypatch.setattr(oauth, "CustomOAuthAssociateRouterBuilder", FakeAssociateBuilder)

    _include_oauth_routes(APIRouter(), public_callback_prefix=PUBLIC_OAUTH_CALLBACK_PREFIX)

    assert captured_state_secrets
    assert set(captured_state_secrets) == {"state-secret"}
