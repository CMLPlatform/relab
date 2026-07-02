"""OAuth redirect validation tests."""

from __future__ import annotations

from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, Response, status

from app.api.auth.services.oauth.base import build_authorize_response, create_oauth_result_redirect

from ._oauth_support import make_auth_flow

pytestmark = pytest.mark.api

ALLOWED_NATIVE_REDIRECT_URI = "relab-app://login"
ALLOWED_WEB_REDIRECT_URI = "https://app.example.com/auth/callback"


async def test_authorize_rejects_untrusted_redirect_uri(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rejects redirect URIs outside the configured allowlist."""
    config, _ = make_auth_flow()

    monkeypatch.setattr(
        "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
        [ALLOWED_WEB_REDIRECT_URI],
    )

    mock_request = MagicMock()
    mock_request.query_params = {"redirect_uri": "https://evil.example.org/auth/callback"}
    mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

    with pytest.raises(HTTPException) as exc_info:
        await build_authorize_response(config, mock_request, Response(), callback_route_name="oauth:callback")

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Invalid redirect_uri"


@pytest.mark.parametrize(
    "redirect_uri",
    [ALLOWED_WEB_REDIRECT_URI, ALLOWED_NATIVE_REDIRECT_URI],
    ids=["web", "native"],
)
async def test_authorize_accepts_exact_allowlisted_redirect_uri(
    redirect_uri: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Accepts an exact allowlisted redirect URI, whether web or native."""
    config, _ = make_auth_flow()

    monkeypatch.setattr(
        "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
        [redirect_uri],
    )

    mock_request = MagicMock()
    mock_request.query_params = {"redirect_uri": redirect_uri}
    mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

    result = await build_authorize_response(config, mock_request, Response(), callback_route_name="oauth:callback")
    assert result.authorization_url == "https://github.com/login/oauth/authorize"


@pytest.mark.parametrize(
    "redirect_uri",
    [
        "https://app.example.com/profile",
        "http://app.example.com/auth/callback",
        "https://app.example.com/auth/callback?next=/profile",
        "https://app.example.com/auth/callback#token",
        "https://user:pass@app.example.com/auth/callback",
    ],
    ids=["unconfigured-path", "unconfigured-scheme", "query-string", "fragment", "embedded-credentials"],
)
async def test_authorize_rejects_non_exact_or_unsafe_redirect_uri(
    redirect_uri: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Rejects redirect URIs that are not exact safe allowlist matches."""
    config, _ = make_auth_flow()

    monkeypatch.setattr(
        "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
        [ALLOWED_WEB_REDIRECT_URI],
    )

    mock_request = MagicMock()
    mock_request.query_params = {"redirect_uri": redirect_uri}
    mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

    with pytest.raises(HTTPException, match="Invalid redirect_uri") as exc_info:
        await build_authorize_response(config, mock_request, Response(), callback_route_name="oauth:callback")

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Invalid redirect_uri"


def test_success_redirect_uses_fragment_status_and_removes_access_tokens() -> None:
    """OAuth redirect results live in fragments and strip leaked access tokens."""
    response = create_oauth_result_redirect(
        "https://app.example.com/auth/callback?foo=bar&access_token=leaky#access_token=also-leaky",
        status="success",
    )

    parsed = urlparse(response.headers["location"])
    query = parse_qs(parsed.query)
    fragment = parse_qs(parsed.fragment)
    assert "access_token" not in query
    assert "access_token" not in fragment
    assert query.get("foo") == ["bar"]
    assert fragment.get("status") == ["success"]
