"""OAuth redirect validation tests."""
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, Response, status

from ._oauth_support import make_auth_builder, make_base_builder

pytestmark = pytest.mark.api

ALLOWED_NATIVE_REDIRECT_URI = "relab-app://login"
ALLOWED_WEB_REDIRECT_URI = "https://app.example.com/auth/callback"


class TestOAuthRedirectValidation:
    """Cover redirect-uri validation and redirect rewriting."""

    async def test_authorize_rejects_untrusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Rejects redirect URIs outside the configured allowlist."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
            [ALLOWED_WEB_REDIRECT_URI],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://evil.example.org/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response())

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    async def test_authorize_accepts_exact_allowlisted_web_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Accepts an exact allowlisted HTTPS redirect URI."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
            [ALLOWED_WEB_REDIRECT_URI],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": ALLOWED_WEB_REDIRECT_URI}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response())
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    async def test_authorize_accepts_exact_allowlisted_native_redirect_uri(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Accepts an exact allowlisted native redirect URI."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
            [ALLOWED_NATIVE_REDIRECT_URI],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": ALLOWED_NATIVE_REDIRECT_URI}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response())
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
        self, redirect_uri: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Rejects redirect URIs that are not exact safe allowlist matches."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_uris",
            [ALLOWED_WEB_REDIRECT_URI],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": redirect_uri}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        with pytest.raises(HTTPException, match="Invalid redirect_uri") as exc_info:
            await builder._get_authorize_handler(mock_request, Response())

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    def test_success_redirect_removes_access_token_from_query(self) -> None:
        """Strips leaked access tokens from success redirects."""
        builder = make_base_builder()

        response = builder._create_success_redirect(
            "https://app.example.com/auth/callback?foo=bar&access_token=leaky",
            Response(),
        )

        query = parse_qs(urlparse(response.headers["location"]).query)
        assert "access_token" not in query
        assert query.get("success") == ["true"]
