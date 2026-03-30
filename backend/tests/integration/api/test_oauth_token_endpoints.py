"""Integration tests for the PKCE Google token-exchange endpoints.

These endpoints receive a Google ID token obtained by the frontend via
expo-auth-session (PKCE) and exchange it for an app session without any
backend OAuth redirect.

Covered:
  POST /auth/oauth/google/cookie/token  — sets httpOnly session cookies
  POST /auth/oauth/google/bearer/token  — returns bearer + refresh tokens
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest
from fastapi import status

from app.api.auth.exceptions import OAuthStateDecodeError, OAuthStateExpiredError

if TYPE_CHECKING:
    from contextlib import AbstractContextManager

    from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_GOOGLE_PAYLOAD = {
    "sub": "google-pkce-user-42",
    "email": "pkce-user@example.com",
    "email_verified": True,
    "iss": "https://accounts.google.com",
    # Use a value within PostgreSQL int4 range (expires 2033) to avoid overflow.
    "exp": 2_000_000_000,
}

_COOKIE_ENDPOINT = "/auth/oauth/google/cookie/token"
_BEARER_ENDPOINT = "/auth/oauth/google/bearer/token"


def _patch_verify(
    payload: dict | None = None,
    *,
    side_effect: type[Exception] | None = None,
) -> AbstractContextManager[MagicMock]:
    """Patch _verify_google_id_token so tests never call Google's JWKS endpoint."""
    if side_effect:
        return patch("app.api.auth.routers.oauth_token._verify_google_id_token", side_effect=side_effect)
    return patch("app.api.auth.routers.oauth_token._verify_google_id_token", return_value=payload)


# ---------------------------------------------------------------------------
# Cookie endpoint
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestGoogleCookieTokenEndpoint:
    """Tests for POST /auth/oauth/google/cookie/token."""

    async def test_valid_token_returns_204(self, async_client: AsyncClient) -> None:
        """A valid Google ID token should create the user and set session cookies."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            response = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "mock-id-token"})

        assert response.status_code == status.HTTP_204_NO_CONTENT

    async def test_valid_token_sets_auth_cookie(self, async_client: AsyncClient) -> None:
        """The response should set an 'auth' cookie for the browser session."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            response = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "mock-id-token"})

        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any("auth=" in header for header in set_cookie_headers), (
            "Expected an 'auth' session cookie to be set"
        )

    async def test_accepts_optional_access_token(self, async_client: AsyncClient) -> None:
        """Providing access_token alongside id_token should succeed."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            response = await async_client.post(
                _COOKIE_ENDPOINT,
                json={"id_token": "mock-id-token", "access_token": "mock-access-token"},
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    async def test_second_login_with_same_sub_returns_204(self, async_client: AsyncClient) -> None:
        """Calling the endpoint twice with the same Google sub should link to the same user account."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            resp1 = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "mock-id-token"})
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            resp2 = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "mock-id-token"})

        assert resp1.status_code == status.HTTP_204_NO_CONTENT
        assert resp2.status_code == status.HTTP_204_NO_CONTENT

    async def test_expired_token_returns_400(self, async_client: AsyncClient) -> None:
        """An expired ID token should return 400."""
        with _patch_verify(side_effect=OAuthStateExpiredError):
            response = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "expired-token"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_invalid_token_returns_400(self, async_client: AsyncClient) -> None:
        """A malformed or untrusted ID token should return 400."""
        with _patch_verify(side_effect=OAuthStateDecodeError):
            response = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "garbage"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_missing_id_token_returns_422(self, async_client: AsyncClient) -> None:
        """A request with no body should fail schema validation."""
        response = await async_client.post(_COOKIE_ENDPOINT, json={})

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_endpoint_is_public(self, async_client: AsyncClient) -> None:
        """The endpoint must be reachable without an existing session (it *is* the login flow)."""
        # Reaching the endpoint at all proves it is not gated by auth middleware.
        # We use an invalid token so the request terminates early with 400 rather
        # than needing a real Google key.
        with _patch_verify(side_effect=OAuthStateDecodeError):
            response = await async_client.post(_COOKIE_ENDPOINT, json={"id_token": "any"})

        assert response.status_code != status.HTTP_401_UNAUTHORIZED
        assert response.status_code != status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# Bearer endpoint
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestGoogleBearerTokenEndpoint:
    """Tests for POST /auth/oauth/google/bearer/token."""

    async def test_valid_token_returns_201_with_token_response(self, async_client: AsyncClient) -> None:
        """A valid Google ID token should return bearer + refresh tokens."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            response = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "mock-id-token"})

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert isinstance(data.get("access_token"), str)
        assert data["access_token"]
        assert isinstance(data.get("refresh_token"), str)
        assert data["refresh_token"]
        assert data.get("token_type") == "bearer"
        assert isinstance(data.get("expires_in"), int)
        assert data["expires_in"] > 0

    async def test_second_login_issues_fresh_tokens(self, async_client: AsyncClient) -> None:
        """Repeated calls with the same Google sub should succeed and return fresh tokens each time."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            resp1 = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "mock-id-token"})
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            resp2 = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "mock-id-token"})

        assert resp1.status_code == status.HTTP_201_CREATED
        assert resp2.status_code == status.HTTP_201_CREATED
        # Each login issues a distinct access token
        assert resp1.json()["access_token"] != resp2.json()["access_token"]

    async def test_accepts_optional_access_token(self, async_client: AsyncClient) -> None:
        """Providing access_token alongside id_token should succeed."""
        with _patch_verify(_VALID_GOOGLE_PAYLOAD):
            response = await async_client.post(
                _BEARER_ENDPOINT,
                json={"id_token": "mock-id-token", "access_token": "mock-access-token"},
            )

        assert response.status_code == status.HTTP_201_CREATED

    async def test_expired_token_returns_400(self, async_client: AsyncClient) -> None:
        """An expired ID token should return 400."""
        with _patch_verify(side_effect=OAuthStateExpiredError):
            response = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "expired-token"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_invalid_token_returns_400(self, async_client: AsyncClient) -> None:
        """A malformed or untrusted ID token should return 400."""
        with _patch_verify(side_effect=OAuthStateDecodeError):
            response = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "garbage"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_missing_id_token_returns_422(self, async_client: AsyncClient) -> None:
        """A request with no body should fail schema validation."""
        response = await async_client.post(_BEARER_ENDPOINT, json={})

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_endpoint_is_public(self, async_client: AsyncClient) -> None:
        """The endpoint must not require an existing session."""
        with _patch_verify(side_effect=OAuthStateDecodeError):
            response = await async_client.post(_BEARER_ENDPOINT, json={"id_token": "any"})

        assert response.status_code != status.HTTP_401_UNAUTHORIZED
        assert response.status_code != status.HTTP_403_FORBIDDEN
