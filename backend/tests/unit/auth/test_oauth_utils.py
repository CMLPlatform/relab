"""Unit tests for OAuth token and cookie helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Response

from app.api.auth.services.oauth_utils import OAuthCookieSettings, generate_state_token, set_csrf_cookie

if TYPE_CHECKING:
    import pytest


def test_generate_state_token_uses_configured_default_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """OAuth state JWTs should default to the configured 10-minute lifetime."""
    captured: dict[str, object] = {}

    def fake_generate_jwt(data: dict[str, str], secret: str, lifetime_seconds: int) -> str:
        captured["data"] = data
        captured["secret"] = secret
        captured["lifetime_seconds"] = lifetime_seconds
        return "jwt-token"

    monkeypatch.setattr("app.api.auth.services.oauth_utils.auth_settings.oauth_state_token_ttl_seconds", 600)
    monkeypatch.setattr("app.api.auth.services.oauth_utils.generate_jwt", fake_generate_jwt)

    token = generate_state_token({"csrftoken": "csrf"}, "test-secret")

    assert token == "jwt-token"
    assert captured["secret"] == "test-secret"
    assert captured["lifetime_seconds"] == 600
    assert captured["data"] == {
        "csrftoken": "csrf",
        "aud": "fastapi-users:oauth-state",
    }


def test_set_csrf_cookie_uses_configured_state_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """OAuth CSRF cookies should expire on the same timeline as state JWTs."""
    monkeypatch.setattr("app.api.auth.services.oauth_utils.auth_settings.oauth_state_token_ttl_seconds", 600)

    response = Response()
    set_csrf_cookie(response, OAuthCookieSettings(secure=False), "csrf-token")

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 1
    assert "Max-Age=600" in set_cookie_headers[0]
