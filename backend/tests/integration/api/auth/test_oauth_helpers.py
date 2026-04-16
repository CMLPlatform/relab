"""OAuth helper and CSRF builder tests."""
# ruff: noqa: D101, D102

from __future__ import annotations

import secrets
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, status
from fastapi_users.jwt import decode_jwt

from app.api.auth.services.oauth import CSRF_TOKEN_KEY, OAuthCookieSettings, generate_csrf_token, generate_state_token

from ._oauth_support import TEST_STATE_JWT_SECRET, make_base_builder
from .shared import FRONTEND_REDIRECT_URI, JWT_DOT_COUNT

pytestmark = pytest.mark.unit


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


class TestOAuthRouterBuilderCSRF:
    def test_verify_state_raises_on_invalid_jwt(self) -> None:
        builder = make_base_builder()
        mock_request = MagicMock()
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, "not-a-valid-jwt")

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_raises_on_csrf_mismatch(self) -> None:
        builder = make_base_builder()
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, TEST_STATE_JWT_SECRET)
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: "wrong-csrf-token"}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, state)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_succeeds_with_matching_csrf(self) -> None:
        builder = make_base_builder()
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
