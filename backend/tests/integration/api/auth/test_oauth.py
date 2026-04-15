"""OAuth helper, builder, and association tests."""
# ruff: noqa: SLF001 # Private method testing is appropriate here

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, Response, status
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.jwt import decode_jwt
from fastapi_users.router.common import ErrorCode

from app.api.auth.services.oauth import (
    CSRF_TOKEN_KEY,
    BaseOAuthRouterBuilder,
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)

from .shared import (
    FRONTEND_REDIRECT_URI,
    JWT_DOT_COUNT,
    TEST_EMAIL,
    TEST_STATE_JWT_SECRET,
    USER1_EMAIL,
    USER2_EMAIL,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from httpx_oauth.oauth2 import OAuth2Token


@pytest.mark.unit
class TestOAuthHelpers:
    """Tests for the OAuth helper functions."""

    def test_generate_csrf_token_is_url_safe_string(self) -> None:
        """Test that the generated CSRF token is a URL-safe string."""
        token = generate_csrf_token()
        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_csrf_token_is_unique(self) -> None:
        """Test that multiple calls to generate_csrf_token produce different tokens."""
        assert generate_csrf_token() != generate_csrf_token()

    def test_generate_state_token_returns_jwt(self) -> None:
        """Test that the generated state token is a JWT string with the expected format."""
        token = generate_state_token({CSRF_TOKEN_KEY: "test-csrf"}, TEST_STATE_JWT_SECRET)
        assert isinstance(token, str)
        assert token.count(".") == JWT_DOT_COUNT

    def test_generate_state_token_embeds_csrf(self) -> None:
        """Test that the generated state token can be decoded to reveal the original CSRF token."""
        csrf = secrets.token_urlsafe(16)
        token = generate_state_token({CSRF_TOKEN_KEY: csrf}, TEST_STATE_JWT_SECRET)
        decoded = decode_jwt(token, TEST_STATE_JWT_SECRET, ["fastapi-users:oauth-state"])
        assert decoded[CSRF_TOKEN_KEY] == csrf


@pytest.mark.unit
class TestOAuthRouterBuilderCSRF:
    """Tests for the CSRF protection logic in BaseOAuthRouterBuilder.verify_state."""

    def _make_builder(self) -> BaseOAuthRouterBuilder:
        mock_client = MagicMock()
        mock_client.name = "github"
        return BaseOAuthRouterBuilder(
            oauth_client=mock_client,
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def test_verify_state_raises_on_invalid_jwt(self) -> None:
        """Test that an exception is raised when the token is not a valid JWT or has an invalid signature."""
        builder = self._make_builder()
        mock_request = MagicMock()
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, "not-a-valid-jwt")

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_raises_on_csrf_mismatch(self) -> None:
        """Test that an exception is raised when the CSRF token does not match the one in the request cookies."""
        builder = self._make_builder()
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: "wrong-csrf-token"}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, state)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_succeeds_with_matching_csrf(self) -> None:
        """Test that verify_state successfully decodes the state and returns its data when the CSRF token matches."""
        builder = self._make_builder()
        csrf_token = generate_csrf_token()
        state = generate_state_token(
            {CSRF_TOKEN_KEY: csrf_token, "frontend_redirect_uri": FRONTEND_REDIRECT_URI},
            TEST_STATE_JWT_SECRET,
        )
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}

        state_data = builder.verify_state(mock_request, state)

        assert state_data[CSRF_TOKEN_KEY] == csrf_token
        assert state_data["frontend_redirect_uri"] == FRONTEND_REDIRECT_URI


@pytest.mark.unit
class TestOAuthRedirectValidation:
    """Tests for the redirect URI validation logic in CustomOAuthRouterBuilder._get_authorize_handler."""

    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
        """Helper to create a CustomOAuthRouterBuilder with a mock OAuth client and backend."""
        mock_client = MagicMock()
        mock_client.name = "github"
        mock_client.get_authorization_url = AsyncMock(return_value="https://github.com/login/oauth/authorize")

        mock_backend = MagicMock()
        mock_backend.name = "cookie"

        return CustomOAuthRouterBuilder(
            oauth_client=mock_client,
            backend=mock_backend,
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    @pytest.mark.asyncio
    async def test_authorize_rejects_untrusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that _get_authorize_handler raises an exception for an untrusted redirect_uri."""
        builder = self._make_auth_builder()

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
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    @pytest.mark.asyncio
    async def test_authorize_accepts_trusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that _get_authorize_handler accepts a trusted redirect_uri."""
        builder = self._make_auth_builder()

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
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    @pytest.mark.asyncio
    async def test_authorize_accepts_dev_regex_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that _get_authorize_handler accepts a redirect_uri that matches the development regex allowlist."""
        builder = self._make_auth_builder()

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
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    @pytest.mark.asyncio
    async def test_authorize_accepts_allowlisted_native_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that a native redirect_uri  is accepted when it is explicitly allowlisted.

        This is the case even if it doesn't match the standard web URL allowlist.
        """
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.allowed_origins", [])
        monkeypatch.setattr("app.api.auth.services.oauth.base.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.base.settings.oauth_allowed_redirect_paths", [])
        monkeypatch.setattr(
            "app.api.auth.services.oauth.base.settings.oauth_allowed_native_redirect_uris",
            ["relab://oauth-callback"],
        )

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "relab://oauth-callback"}
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)
        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    @pytest.mark.asyncio
    async def test_authorize_rejects_redirect_uri_with_embedded_credentials(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test that an exception is raised when the redirect_uri contains embedded credentials.

        This is the case even if the host and path are allowlisted.
        """
        builder = self._make_auth_builder()

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
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    def test_success_redirect_removes_access_token_from_query(self) -> None:
        """Test that the  the access_token is removed from the query parameters before redirecting to the frontend."""
        builder = BaseOAuthRouterBuilder(
            oauth_client=MagicMock(name="github"),
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

        response = builder._create_success_redirect(
            "https://app.example.com/auth/callback?foo=bar&access_token=leaky",
            Response(),
        )

        query = parse_qs(urlparse(response.headers["location"]).query)
        assert "access_token" not in query
        assert query.get("success") == ["true"]


@pytest.mark.unit
class TestOAuthCallbackLinkingPolicy:
    """Tests for the account linking policy in CustomOAuthRouterBuilder._get_callback_handler.

    This ensures that users cannot be automatically linked based on email
    and must explicitly link accounts through the associate flow.
    """

    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
        """Helper to create a CustomOAuthRouterBuilder with a mock OAuth client and backend."""
        mock_client = MagicMock()
        mock_client.name = "github"
        mock_client.get_id_email = AsyncMock(return_value=("provider-account-id", TEST_EMAIL))

        mock_backend = MagicMock()
        mock_backend.name = "cookie"
        mock_backend.login = AsyncMock(return_value=Response(status_code=status.HTTP_200_OK))

        return CustomOAuthRouterBuilder(
            oauth_client=mock_client,
            backend=mock_backend,
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def _make_request_with_valid_state(self) -> tuple[MagicMock, tuple[OAuth2Token, str]]:
        """Helper to create a mock request with a valid state token for the associate flow, tied to a given user ID."""
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
        return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)

    @pytest.mark.asyncio
    async def test_callback_passes_associate_by_email_false(self) -> None:
        """Test that the OAuth callback is called with associate_by_email set to False.

        This ensures that users cannot be automatically linked based on email
        and must explicitly link accounts through the associate flow.
        """
        builder = self._make_auth_builder()
        request, access_token_state = self._make_request_with_valid_state()

        user = MagicMock()
        user.is_active = True

        user_manager = MagicMock()
        user_manager.oauth_callback = AsyncMock(return_value=user)
        user_manager.on_after_login = AsyncMock()

        strategy = MagicMock()

        response = await builder._get_callback_handler(request, access_token_state, user_manager, strategy)
        assert response.status_code == status.HTTP_200_OK
        assert user_manager.oauth_callback.await_args is not None
        assert user_manager.oauth_callback.await_args.kwargs["associate_by_email"] is False

    @pytest.mark.asyncio
    async def test_callback_returns_stable_existing_user_error(self) -> None:
        """Test that if the OAuth callback raises a UserAlreadyExists error, it results in a consistent HTTPException.

        It should have a specific error code, rather than potentially exposing different errors or stack traces.
        """
        builder = self._make_auth_builder()
        request, access_token_state = self._make_request_with_valid_state()

        user_manager = MagicMock()
        user_manager.oauth_callback = AsyncMock(side_effect=UserAlreadyExists())
        user_manager.on_after_login = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, access_token_state, user_manager, MagicMock())

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == ErrorCode.OAUTH_USER_ALREADY_EXISTS


@pytest.mark.unit
class TestOAuthAssociateFlow:
    """Tests for the OAuth provider association flow.

    Here, a logged-in user can link an OAuth provider account to their existing account.
    """

    def _make_associate_builder(self) -> CustomOAuthAssociateRouterBuilder:
        """Helper to create a CustomOAuthAssociateRouterBuilder with a mock OAuth client and backend."""
        mock_client = MagicMock()
        mock_client.name = "github"
        mock_client.get_id_email = AsyncMock(return_value=("provider-account-id", TEST_EMAIL))
        mock_authenticator = MagicMock()
        mock_schema = MagicMock()
        mock_schema.model_validate.side_effect = lambda value: {"user_id": str(value.id), "email": value.email}

        return CustomOAuthAssociateRouterBuilder(
            oauth_client=mock_client,
            authenticator=mock_authenticator,
            user_schema=mock_schema,
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def _make_associate_request_with_valid_state(self, user_id: str) -> tuple[MagicMock, tuple[OAuth2Token, str]]:
        """Helper to create a mock request with a valid state token for the associate flow, for a given user ID."""
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token, "sub": user_id}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
        return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)

    @pytest.mark.asyncio
    async def test_associate_callback_links_provider_for_current_user(self) -> None:
        """Test that the associate callback successfully links the OAuth provider account to the current user."""
        builder = self._make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = self._make_associate_request_with_valid_state(str(current_user.id))
        mock_session = MagicMock()
        mock_scalars_result = MagicMock()
        mock_scalars_result.first.return_value = None
        mock_exec_result = MagicMock()
        mock_exec_result.scalars.return_value = mock_scalars_result
        mock_session.execute = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock(return_value=current_user)

        result = cast(
            "Mapping[str, Any]",
            await builder._get_callback_handler(request, current_user, access_token_state, user_manager),
        )

        assert result["email"] == TEST_EMAIL
        assert user_manager.oauth_associate_callback.await_count == 1

    @pytest.mark.asyncio
    async def test_associate_callback_rejects_provider_linked_to_other_user(self) -> None:
        """Test that an exception is raised when the OAuth account is already linked to another user."""
        builder = self._make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = self._make_associate_request_with_valid_state(str(current_user.id))
        existing_account = MagicMock()
        existing_account.user_id = USER2_EMAIL

        mock_session = MagicMock()
        mock_scalars_result = MagicMock()
        mock_scalars_result.first.return_value = existing_account
        mock_exec_result = MagicMock()
        mock_exec_result.scalars.return_value = mock_scalars_result
        mock_session.execute = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, current_user, access_token_state, user_manager)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "This account is already linked to another user."
