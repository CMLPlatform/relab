"""OAuth redirect validation tests."""
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, Response, status

from ._oauth_support import make_auth_builder, make_base_builder

pytestmark = pytest.mark.api


class TestOAuthRedirectValidation:
    """Cover redirect-uri validation and redirect rewriting."""

    async def test_authorize_rejects_untrusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Rejects redirect URIs outside the configured allowlist."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.core_settings.allowed_origins",
            ["https://app.example.com"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.cors_origin_regex", None)
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths",
            ["/auth/callback"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://evil.example.org/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    async def test_authorize_accepts_trusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Accepts a trusted HTTPS redirect URI."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.core_settings.allowed_origins",
            ["https://app.example.com"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.cors_origin_regex", None)
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths",
            ["/auth/callback"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://app.example.com/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    async def test_authorize_accepts_dev_regex_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Accepts a development redirect URI matched by the regex."""
        builder = make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.allowed_origins", [])
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.core_settings.cors_origin_regex",
            r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
        )
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths",
            ["/auth/callback"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "http://192.168.1.50:3000/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    async def test_authorize_accepts_allowlisted_native_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Accepts an explicitly allowlisted native redirect URI."""
        builder = make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.allowed_origins", [])
        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths", [])
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris",
            ["relab://oauth-callback"],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "relab://oauth-callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    async def test_authorize_rejects_redirect_uri_with_embedded_credentials(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Rejects redirect URIs containing embedded credentials."""
        builder = make_auth_builder()

        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.core_settings.allowed_origins",
            ["https://app.example.com"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.cors_origin_regex", None)
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths",
            ["/auth/callback"],
        )
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://user:pass@app.example.com/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

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
