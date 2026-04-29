"""Unit tests for OAuth router wiring."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import HttpUrl

from app.api.auth.routers.oauth import PUBLIC_OAUTH_CALLBACK_PREFIX, _public_callback_url

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
