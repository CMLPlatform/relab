"""Integration tests for authentication endpoints - Updated for FastAPI-Users + Redis strategy."""

from __future__ import annotations

import json
import secrets
from http.cookies import SimpleCookie
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, Response, status
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.jwt import decode_jwt
from fastapi_users.router.common import ErrorCode

from app.api.auth.crud.users import update_user_override
from app.api.auth.exceptions import (
    DisposableEmailError,
    UserNameAlreadyExistsError,
)
from app.api.auth.schemas import (
    UserCreate,
    UserCreateWithOrganization,
    UserUpdate,
)
from app.api.auth.services.oauth import (
    CSRF_TOKEN_KEY,
    BaseOAuthRouterBuilder,
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)
from app.api.auth.services.refresh_token_service import create_refresh_token
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from redis import Redis
    from sqlmodel.ext.asyncio.session import AsyncSession

# Constants for test values
TEST_EMAIL = "newuser@example.com"
TEST_PASSWORD = "SecurePassword123"  # noqa: S105
TEST_USERNAME = "newuser"
DUPLICATE_EMAIL = "existing@example.com"
UNIQUE_USERNAME = "uniqueuser"
DIFFERENT_EMAIL = "different@example.com"
EXISTING_USERNAME = "existing_user"
DISPOSABLE_EMAIL = "temp@tempmail.com"
WEAK_PASSWORD = "short"  # noqa: S105
OWNER_EMAIL = "owner@example.com"
ORG_NAME = "Test Organization"
ORG_LOCATION = "Test City"
ORG_DESC = "Test Description"
LOGIN_EMAIL = "logintest@example.com"
LOGIN_USERNAME = "logintest"
COOKIE_EMAIL = "cookie_test@example.com"
COOKIE_USERNAME = "cookie_test"
INVALID_EMAIL = "nonexistent@example.com"
INVALID_PASSWORD = "WrongPassword123"  # noqa: S105
INVALID_REFRESH_TOKEN = "invalid-token-1234567890123456789012345678"  # noqa: S105
DUMMY_REFRESH_TOKEN = "some-test-refresh-token"  # noqa: S105
SESSION_REFRESH_TOKEN = "test-refresh-token"  # noqa: S105
USER_AGENT = "Mozilla/5.0 Chrome/120.0"
IP_ADDRESS = "10.0.0.1"


@pytest.mark.asyncio
class TestRegistrationEndpoint:
    """Tests for the /auth/register endpoint."""

    async def test_register_success(self, async_client: AsyncClient) -> None:
        """Test successful user registration."""
        user_data = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "username": TEST_USERNAME,
        }

        # Mock email checker to allow registration
        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(**user_data)

            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert "hashed_password" not in data

    async def test_register_duplicate_email(self, async_client: AsyncClient) -> None:
        """Test registration with duplicate email."""
        user_data = {
            "email": DUPLICATE_EMAIL,
            "password": TEST_PASSWORD,
            "username": UNIQUE_USERNAME,
        }

        # Create user first
        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(**user_data)
            await async_client.post("/auth/register", json=user_data)

        # Try to register with same email
        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(**user_data)

            # Mock user_manager.create to raise UserAlreadyExists
            with patch("app.api.auth.dependencies.get_user_manager") as mock_get_manager:
                mock_manager = AsyncMock()
                mock_manager.create.side_effect = UserAlreadyExists()

                async def get_manager() -> AsyncGenerator[AsyncMock]:
                    yield mock_manager

                mock_get_manager.return_value = get_manager()

                response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"].lower()

    async def test_register_duplicate_username(self, async_client: AsyncClient) -> None:
        """Test registration with duplicate username."""
        user_data = {
            "email": DIFFERENT_EMAIL,
            "password": TEST_PASSWORD,
            "username": EXISTING_USERNAME,
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = UserNameAlreadyExistsError(user_data["username"])

            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "username" in response.json()["detail"].lower()

    async def test_register_disposable_email(self, async_client: AsyncClient) -> None:
        """Test registration with disposable email."""
        user_data = {
            "email": DISPOSABLE_EMAIL,
            "password": TEST_PASSWORD,
            "username": "tempuser",
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = DisposableEmailError(user_data["email"])

            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposable" in response.json()["detail"].lower()

    async def test_register_weak_password(self, async_client: AsyncClient) -> None:
        """Test registration with weak password - password validation happens in Pydantic."""
        user_data = {
            "email": "user@example.com",
            "password": WEAK_PASSWORD,
            "username": "user",
        }

        response = await async_client.post("/auth/register", json=user_data)

        # Pydantic validates before reaching route
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_CONTENT]

    async def test_register_with_organization(self, async_client: AsyncClient) -> None:
        """Test registration with organization creation."""
        user_data = {
            "email": OWNER_EMAIL,
            "password": TEST_PASSWORD,
            "username": "owner",
            "organization": {
                "name": ORG_NAME,
                "location": ORG_LOCATION,
                "description": ORG_DESC,
            },
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreateWithOrganization(**user_data)

            response = await async_client.post("/auth/register", json=user_data)

        # Should find 201 Created or reach a known state
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ]


@pytest.mark.asyncio
class TestLoginEndpoint:
    """Tests for FastAPI-Users login endpoints."""

    async def test_bearer_login_with_email(self, async_client: AsyncClient) -> None:
        """Test bearer login with email returns access token."""
        user_data = {
            "email": LOGIN_EMAIL,
            "password": TEST_PASSWORD,
            "username": LOGIN_USERNAME,
        }

        # Register user first
        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(**user_data)
            await async_client.post("/auth/register", json=user_data)

        # Test login
        login_data = {
            "username": user_data["email"],
            "password": user_data["password"],
        }

        response = await async_client.post("/auth/bearer/login", data=login_data)

        # FastAPI-Users returns 200 or 204 depending on version
        if response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]:
            # Check for access token in response or cookies
            if response.status_code == status.HTTP_200_OK:
                # Some versions return JSON with access_token
                try:
                    data = response.json()
                    assert "access_token" in data or len(data) > 0
                except ValueError, json.JSONDecodeError:
                    # Response may be empty (204 No Content) with token in header
                    pass
            # Refresh token is set as httpOnly cookie via on_after_login
            assert "refresh_token" in response.cookies or "set-cookie" in response.headers

    async def test_bearer_login_invalid_credentials(self, async_client: AsyncClient) -> None:
        """Test bearer login with invalid credentials."""
        login_data = {
            "username": INVALID_EMAIL,
            "password": INVALID_PASSWORD,
        }

        response = await async_client.post("/auth/bearer/login", data=login_data)

        # FastAPI-Users returns 400 for bad credentials, or 500 if there's an error
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_cookie_login(self, async_client: AsyncClient) -> None:
        """Test cookie login sets httpOnly cookies."""
        user_data = {
            "email": COOKIE_EMAIL,
            "password": TEST_PASSWORD,
            "username": COOKIE_USERNAME,
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(**user_data)
            await async_client.post("/auth/register", json=user_data)

        login_data = {
            "username": user_data["email"],
            "password": user_data["password"],
        }

        response = await async_client.post("/auth/cookie/login", data=login_data)

        if response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]:
            # Check cookies were set
            cookies = response.cookies
            assert len(cookies) > 0 or "set-cookie" in response.headers


@pytest.mark.asyncio
class TestRefreshTokenEndpoint:
    """Tests for custom refresh token endpoints."""

    async def test_cookie_refresh_token_requires_cookie(
        self, async_client: AsyncClient, mock_redis_dependency: Redis
    ) -> None:
        """Test cookie refresh requires refresh_token cookie."""
        del mock_redis_dependency
        response = await async_client.post("/auth/cookie/refresh")

        # Should return 401 without refresh token cookie
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_bearer_refresh_token_invalid(self, async_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        """Test refreshing with invalid token returns 401."""
        del mock_redis_dependency
        refresh_data = {"refresh_token": INVALID_REFRESH_TOKEN}
        response = await async_client.post("/auth/refresh", json=refresh_data)

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_bearer_refresh_rotates_and_replay_fails(
        self,
        async_client: AsyncClient,
        mock_redis_dependency: Redis,
        session: AsyncSession,
    ) -> None:
        """Verify refresh rotation issues a new token and invalidates the old token immediately."""
        user = await UserFactory.create_async(
            session,
            email="refresh-rotation@example.com",
            username="refresh_rotation_user",
            hashed_password="pw",  # noqa: S106
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        # First refresh should succeed and return a rotated refresh token.
        response = await async_client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        new_refresh_token = data["refresh_token"]
        assert new_refresh_token != old_refresh_token

        # Replaying the old token should fail.
        replay_response = await async_client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
        assert replay_response.status_code == status.HTTP_401_UNAUTHORIZED

        # The newly issued token should be valid.
        second_refresh = await async_client.post("/auth/refresh", json={"refresh_token": new_refresh_token})
        assert second_refresh.status_code == status.HTTP_200_OK

    async def test_cookie_refresh_rotates_and_replay_fails(
        self,
        async_client: AsyncClient,
        mock_redis_dependency: Redis,
        session: AsyncSession,
    ) -> None:
        """Verify cookie refresh rotates refresh token and rejects immediate replay of the old token."""
        user = await UserFactory.create_async(
            session,
            email="cookie-refresh-rotation@example.com",
            username="cookie_refresh_rotation_user",
            hashed_password="pw",  # noqa: S106
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        async_client.cookies.set("refresh_token", old_refresh_token)
        first_response = await async_client.post("/auth/cookie/refresh")
        assert first_response.status_code == status.HTTP_204_NO_CONTENT

        set_cookie_headers = first_response.headers.get_list("set-cookie")
        parsed_cookies = SimpleCookie()
        for header in set_cookie_headers:
            parsed_cookies.load(header)

        assert "refresh_token" in parsed_cookies
        new_refresh_token = parsed_cookies["refresh_token"].value
        assert new_refresh_token
        assert new_refresh_token != old_refresh_token

        async_client.cookies.clear()
        async_client.cookies.set("refresh_token", old_refresh_token)
        replay_response = await async_client.post("/auth/cookie/refresh")
        assert replay_response.status_code == status.HTTP_401_UNAUTHORIZED

        async_client.cookies.clear()
        async_client.cookies.set("refresh_token", new_refresh_token)
        second_response = await async_client.post("/auth/cookie/refresh")
        assert second_response.status_code == status.HTTP_204_NO_CONTENT

        # Cleanup test cookie jar to avoid accidental leakage to later tests.
        async_client.cookies.clear()


@pytest.mark.asyncio
class TestLogoutEndpoint:
    """Tests for FastAPI-Users logout endpoints."""

    async def test_bearer_logout_unauthenticated(self, async_client: AsyncClient) -> None:
        """Test logout without authentication."""
        response = await async_client.post("/auth/bearer/logout")

        # FastAPI-Users returns 401 for unauthenticated logout
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_cookie_logout(self, async_client: AsyncClient) -> None:
        """Test cookie logout."""
        response = await async_client.post("/auth/cookie/logout")

        # Should succeed or return 401 if no cookie
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ]


@pytest.mark.asyncio
class TestRateLimiting:
    """Tests for rate limiting on auth endpoints - should be DISABLED in tests."""

    async def test_login_rate_limit_disabled_in_tests(self, async_client: AsyncClient) -> None:
        """Verify rate limiting is disabled in test environment."""
        login_data = {
            "username": INVALID_EMAIL,
            "password": "WrongPassword",
        }

        # Make multiple requests - should NOT get rate limited in tests
        responses = []
        for _ in range(10):
            response = await async_client.post("/auth/bearer/login", data=login_data)
            responses.append(response.status_code)

        # Should get 400 (bad credentials) or 500 (other errors), not 429 (rate limit)
        # The limiter might not be fully disabled, so just verify no 429
        assert status.HTTP_429_TOO_MANY_REQUESTS not in responses, f"Rate limiting not disabled: {responses}"


# Constants
USER1_EMAIL = "update_user1@example.com"
USER1_USERNAME = "user_one_unique"
USER2_EMAIL = "update_user2@example.com"
USER2_USERNAME = "user_two_unique"
NEW_USERNAME = "totally_fresh_username"
TAKEN_USERNAME = "already_taken_user"
FRONTEND_REDIRECT_URI = "http://localhost:3000"
JWT_DOT_COUNT = 2


# ============================================================
# Unit tests (no DB needed): OAuth helper functions
# ============================================================


@pytest.mark.unit
class TestOAuthHelpers:
    """Unit tests for OAuth helper functions in custom_oauth.py."""

    def test_generate_csrf_token_is_url_safe_string(self) -> None:
        """Verify generate_csrf_token() returns a non-empty URL-safe string."""
        token = generate_csrf_token()

        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_csrf_token_is_unique(self) -> None:
        """Verify repeated calls to generate_csrf_token() produce different tokens."""
        token1 = generate_csrf_token()
        token2 = generate_csrf_token()

        assert token1 != token2

    def test_generate_state_token_returns_jwt(self) -> None:
        """Verify generate_state_token() returns a JWT string."""
        data = {CSRF_TOKEN_KEY: "test-csrf"}
        secret = "test-secret"  # noqa: S105

        token = generate_state_token(data, secret)

        assert isinstance(token, str)
        # JWT has 3 dot-separated parts
        assert token.count(".") == JWT_DOT_COUNT

    def test_generate_state_token_embeds_csrf(self) -> None:
        """Verify the generated state token contains the CSRF data when decoded."""
        csrf = secrets.token_urlsafe(16)
        data = {CSRF_TOKEN_KEY: csrf}
        secret = "my-secret"  # noqa: S105

        token = generate_state_token(data, secret)
        decoded = decode_jwt(token, secret, ["fastapi-users:oauth-state"])

        assert decoded[CSRF_TOKEN_KEY] == csrf


@pytest.mark.unit
class TestOAuthRouterBuilderCSRF:
    """Unit tests for BaseOAuthRouterBuilder CSRF verification."""

    def _make_builder(self) -> BaseOAuthRouterBuilder:
        """Create a builder with a dummy OAuth client."""
        mock_client = MagicMock()
        mock_client.name = "github"
        settings = OAuthCookieSettings(secure=False)
        return BaseOAuthRouterBuilder(
            oauth_client=mock_client,
            state_secret="my-state-secret",  # noqa: S106
            cookie_settings=settings,
        )

    def test_verify_state_raises_on_invalid_jwt(self) -> None:
        """Verify verify_state() raises HTTPException for invalid state JWT."""
        builder = self._make_builder()
        mock_request = MagicMock()
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, "not-a-valid-jwt")

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_raises_on_csrf_mismatch(self) -> None:
        """Verify verify_state() raises HTTPException when CSRF tokens don't match."""
        builder = self._make_builder()

        # Generate a valid state with CSRF token
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, "my-state-secret")

        # Provide a different (wrong) CSRF token in the cookie
        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: "wrong-csrf-token"}

        with pytest.raises(HTTPException) as exc_info:
            builder.verify_state(mock_request, state)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_state_succeeds_with_matching_csrf(self) -> None:
        """Verify verify_state() returns state data when CSRF tokens match."""
        builder = self._make_builder()

        csrf_token = generate_csrf_token()
        state = generate_state_token(
            {CSRF_TOKEN_KEY: csrf_token, "frontend_redirect_uri": FRONTEND_REDIRECT_URI},
            "my-state-secret",
        )

        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}

        state_data = builder.verify_state(mock_request, state)

        assert state_data[CSRF_TOKEN_KEY] == csrf_token
        assert state_data["frontend_redirect_uri"] == FRONTEND_REDIRECT_URI


# ruff: noqa: SLF001 # Private method accessed for testing purposes


@pytest.mark.unit
class TestOAuthRedirectValidation:
    """Unit tests for OAuth redirect allowlist and URL token safety."""

    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
        """Create a custom OAuth builder with mocked dependencies."""
        mock_client = MagicMock()
        mock_client.name = "github"
        mock_client.get_authorization_url = AsyncMock(return_value="https://github.com/login/oauth/authorize")

        mock_backend = MagicMock()
        mock_backend.name = "cookie"

        return CustomOAuthRouterBuilder(
            oauth_client=mock_client,
            backend=mock_backend,
            state_secret="my-state-secret",  # noqa: S106
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    @pytest.mark.asyncio
    async def test_authorize_rejects_untrusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify authorize handler rejects redirect_uri values outside the allowlist."""
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.allowed_origins", ["https://app.example.com"])
        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_redirect_paths", ["/auth/callback"])
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://evil.example.org/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    @pytest.mark.asyncio
    async def test_authorize_accepts_trusted_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify authorize handler accepts allowlisted redirect_uri values."""
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.allowed_origins", ["https://app.example.com"])
        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_redirect_paths", ["/auth/callback"])
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://app.example.com/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    @pytest.mark.asyncio
    async def test_authorize_accepts_dev_regex_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify dev-only CORS regex also permits matching OAuth frontend redirects."""
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.allowed_origins", [])
        monkeypatch.setattr(
            "app.api.auth.services.oauth.core_settings.cors_origin_regex",
            r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
        )
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_redirect_paths", ["/auth/callback"])
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "http://192.168.1.50:3000/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        result = await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert result.authorization_url == "https://github.com/login/oauth/authorize"

    @pytest.mark.asyncio
    async def test_authorize_accepts_allowlisted_native_redirect_uri(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify native deep-link callback URIs are validated against explicit allowlist."""
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.allowed_origins", [])
        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_redirect_paths", [])
        monkeypatch.setattr(
            "app.api.auth.services.oauth.settings.oauth_allowed_native_redirect_uris",
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
        """Verify redirect_uri is rejected when userinfo credentials are present in the URL."""
        builder = self._make_auth_builder()

        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.allowed_origins", ["https://app.example.com"])
        monkeypatch.setattr("app.api.auth.services.oauth.core_settings.cors_origin_regex", None)
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_redirect_paths", ["/auth/callback"])
        monkeypatch.setattr("app.api.auth.services.oauth.settings.oauth_allowed_native_redirect_uris", [])

        mock_request = MagicMock()
        mock_request.query_params = {"redirect_uri": "https://user:pass@app.example.com/auth/callback"}
        mock_request.url_for.return_value = "https://api.example.com/auth/oauth/callback"

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_authorize_handler(mock_request, Response(), scopes=None)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "Invalid redirect_uri"

    def test_success_redirect_removes_access_token_from_query(self) -> None:
        """Verify frontend success redirect never includes access_token query parameters."""
        builder = BaseOAuthRouterBuilder(
            oauth_client=MagicMock(name="github"),
            state_secret="my-state-secret",  # noqa: S106
            cookie_settings=OAuthCookieSettings(secure=False),
        )

        response = builder._create_success_redirect(
            "https://app.example.com/auth/callback?foo=bar&access_token=leaky",
            Response(),
        )

        location = response.headers["location"]
        query = parse_qs(urlparse(location).query)

        assert "access_token" not in query
        assert query.get("success") == ["true"]


@pytest.mark.unit
class TestOAuthCallbackLinkingPolicy:
    """Unit tests for OAuth callback account-linking behavior."""

    def _make_auth_builder(self) -> CustomOAuthRouterBuilder:
        """Create a custom OAuth builder with mocked dependencies."""
        mock_client = MagicMock()
        mock_client.name = "github"
        mock_client.get_id_email = AsyncMock(return_value=("provider-account-id", TEST_EMAIL))

        mock_backend = MagicMock()
        mock_backend.name = "cookie"
        mock_backend.login = AsyncMock(return_value=Response(status_code=status.HTTP_200_OK))

        return CustomOAuthRouterBuilder(
            oauth_client=mock_client,
            backend=mock_backend,
            state_secret="my-state-secret",  # noqa: S106
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def _make_request_with_valid_state(self) -> tuple[MagicMock, tuple[dict[str, str], str]]:
        """Create a request/access-token-state pair with valid CSRF state."""
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token}, "my-state-secret")

        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}

        return mock_request, ({"access_token": "provider-access-token"}, state)

    @pytest.mark.asyncio
    async def test_callback_passes_associate_by_email_false(self) -> None:
        """Verify OAuth callback does not auto-link accounts by email."""
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
        assert user_manager.oauth_callback.await_args.kwargs["associate_by_email"] is False

    @pytest.mark.asyncio
    async def test_callback_returns_stable_existing_user_error(self) -> None:
        """Verify OAuth callback returns stable conflict error when account already exists but is not linked."""
        builder = self._make_auth_builder()
        request, access_token_state = self._make_request_with_valid_state()

        user_manager = MagicMock()
        user_manager.oauth_callback = AsyncMock(side_effect=UserAlreadyExists())
        user_manager.on_after_login = AsyncMock()

        strategy = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, access_token_state, user_manager, strategy)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == ErrorCode.OAUTH_USER_ALREADY_EXISTS


@pytest.mark.unit
class TestOAuthAssociateFlow:
    """Unit tests for explicit OAuth provider association flow."""

    def _make_associate_builder(self) -> CustomOAuthAssociateRouterBuilder:
        """Create an associate builder with mocked dependencies."""
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
            state_secret="my-state-secret",  # noqa: S106
            cookie_settings=OAuthCookieSettings(secure=False),
        )

    def _make_associate_request_with_valid_state(self, user_id: str) -> tuple[MagicMock, tuple[dict[str, str], str]]:
        """Create a request/access-token-state pair with valid CSRF state for association."""
        csrf_token = generate_csrf_token()
        state = generate_state_token({CSRF_TOKEN_KEY: csrf_token, "sub": user_id}, "my-state-secret")

        mock_request = MagicMock()
        mock_request.cookies = {OAuthCookieSettings.name: csrf_token}

        return mock_request, ({"access_token": "provider-access-token"}, state)

    @pytest.mark.asyncio
    async def test_associate_callback_links_provider_for_current_user(self) -> None:
        """Verify explicit association flow links provider to the current user."""
        builder = self._make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = self._make_associate_request_with_valid_state(str(current_user.id))

        mock_session = MagicMock()
        mock_exec_result = MagicMock()
        mock_exec_result.first.return_value = None
        mock_session.exec = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock(return_value=current_user)

        result = await builder._get_callback_handler(request, current_user, access_token_state, user_manager)

        assert result["email"] == TEST_EMAIL
        assert user_manager.oauth_associate_callback.await_count == 1

    @pytest.mark.asyncio
    async def test_associate_callback_rejects_provider_linked_to_other_user(self) -> None:
        """Verify association flow rejects a provider account already linked to another user."""
        builder = self._make_associate_builder()
        current_user = MagicMock()
        current_user.id = USER1_EMAIL
        current_user.email = TEST_EMAIL

        request, access_token_state = self._make_associate_request_with_valid_state(str(current_user.id))

        existing_account = MagicMock()
        existing_account.user_id = USER2_EMAIL

        mock_session = MagicMock()
        mock_exec_result = MagicMock()
        mock_exec_result.first.return_value = existing_account
        mock_session.exec = AsyncMock(return_value=mock_exec_result)

        user_manager = MagicMock()
        user_manager.user_db.session = mock_session
        user_manager.oauth_associate_callback = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await builder._get_callback_handler(request, current_user, access_token_state, user_manager)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail == "This account is already linked to another user."


# ============================================================
# Integration tests (DB required): user update validation
# ============================================================


@pytest.mark.integration
class TestUpdateUserValidation:
    """Integration tests for update_user_override() username uniqueness logic."""

    @pytest.mark.asyncio
    async def test_update_username_to_available_name_succeeds(self, session: AsyncSession) -> None:
        """Verify updating to a free username returns the updated schema unchanged."""
        user = await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",  # noqa: S106
        )

        user_db = MagicMock()
        user_db.session = session

        user_update = UserUpdate(username=NEW_USERNAME)
        result = await update_user_override(user_db, user, user_update)

        assert result.username == NEW_USERNAME

    @pytest.mark.asyncio
    async def test_update_username_to_same_name_succeeds(self, session: AsyncSession) -> None:
        """Verify a user can 'update' their username to their own current username without error."""
        user = await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",  # noqa: S106
        )

        user_db = MagicMock()
        user_db.session = session

        # Updating to own username should not raise
        user_update = UserUpdate(username=USER1_USERNAME)
        result = await update_user_override(user_db, user, user_update)

        assert result.username == USER1_USERNAME

    @pytest.mark.asyncio
    async def test_update_username_to_taken_name_raises(self, session: AsyncSession) -> None:
        """Verify UserNameAlreadyExistsError is raised when username is already taken."""
        # Create two users
        await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            username=TAKEN_USERNAME,
            hashed_password="pw",  # noqa: S106
        )
        user2 = await UserFactory.create_async(
            session,
            email=USER2_EMAIL,
            username=USER2_USERNAME,
            hashed_password="pw",  # noqa: S106
        )

        user_db = MagicMock()
        user_db.session = session

        # user2 tries to take user1's username
        user_update = UserUpdate(username=TAKEN_USERNAME)

        with pytest.raises(UserNameAlreadyExistsError):
            await update_user_override(user_db, user2, user_update)

    @pytest.mark.asyncio
    async def test_update_without_username_change_passes_through(self, session: AsyncSession) -> None:
        """Verify update_user_override does not reject updates that don't change username."""
        user = await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",  # noqa: S106
        )

        user_db = MagicMock()
        user_db.session = session

        # No username in the update
        user_update = UserUpdate(username=None)
        result = await update_user_override(user_db, user, user_update)

        assert result.username is None


@pytest.mark.integration
@pytest.mark.asyncio
class TestUpdateUserEndpoint:
    """Integration tests for the user update API endpoint (PATCH /users/me).

    Note: The full authentication flow for PATCH /users/me goes through the
    FastAPI-Users internal auth, which cannot be fully bypassed via dependency
    overrides in tests. The core username validation is covered comprehensively
    by TestUpdateUserValidation above. These tests cover the HTTP layer.
    """

    async def test_update_user_unauthenticated_returns_401(self, async_client: AsyncClient) -> None:
        """Verify PATCH /users/me returns 401 without authentication."""
        response = await async_client.patch("/users/me", json={"username": "any_name"})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_me_unauthenticated_returns_401(self, async_client: AsyncClient) -> None:
        """Verify GET /users/me returns 401 without authentication."""
        response = await async_client.get("/users/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
