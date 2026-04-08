"""OAuth helper, builder, and association tests."""

# ruff: noqa: D101,D102,SLF001

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
    def test_generate_csrf_token_is_url_safe_string(self) -> None:
        token = generate_csrf_token()
        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_csrf_token_is_unique(self) -> None:
        assert generate_csrf_token() != generate_csrf_token()

    def test_generate_state_token_returns_jwt(self) -> None:
        token = generate_state_token({CSRF_TOKEN_KEY: "test-csrf"}, TEST_STATE_JWT_SECRET)
        assert isinstance(token, str)
        assert token.count(".") == JWT_DOT_COUNT

    def test_generate_state_token_embeds_csrf(self) -> None:
        csrf = secrets.token_urlsafe(16)
        token = generate_state_token({CSRF_TOKEN_KEY: csrf}, TEST_STATE_JWT_SECRET)
        decoded = decode_jwt(token, TEST_STATE_JWT_SECRET, ["fastapi-users:oauth-state"])
        assert decoded[CSRF_TOKEN_KEY] == csrf


@pytest.mark.unit
class TestOAuthRouterBuilderCSRF:
    def _make_builder(self) -> BaseOAuthRouterBuilder:
        mock_client = MagicMock()
        mock_client.name = "github"
        return BaseOAuthRouterBuilder(
            oauth_client=mock_client,
            state_secret=TEST_STATE_JWT_SECRET,
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def test_verify_state_raises_on_invalid_jwt(self) -> None:
        builder = self._make_builder()
        mock_request = MagicMock()
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, "not-a-valid-jwt")

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_raises_on_csrf_mismatch(self) -> None:
        builder = self._make_builder()
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: "wrong-csrf-token"}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, state)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_succeeds_with_matching_csrf(self) -> None:
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
    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
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
    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
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
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
        return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)

    @pytest.mark.asyncio
    async def test_callback_passes_associate_by_email_false(self) -> None:
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
    def _make_associate_builder(self) -> CustomOAuthAssociateRouterBuilder:
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
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token, "sub": user_id}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
        return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)

    @pytest.mark.asyncio
    async def test_associate_callback_links_provider_for_current_user(self) -> None:
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
