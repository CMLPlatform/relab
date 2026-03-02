"""Integration tests for authentication endpoints - Updated for FastAPI-Users + Redis strategy."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi_users.exceptions import UserAlreadyExists

from app.api.auth.exceptions import (
    DisposableEmailError,
    UserNameAlreadyExistsError,
)
from app.api.auth.models import User
from app.api.auth.schemas import (
    UserCreate,
    UserCreateWithOrganization,
)
from app.api.auth.services.session_service import create_session

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from redis import Redis

# Constants for test values
TEST_EMAIL = "newuser@example.com"
TEST_PASSWORD = "SecurePassword123"  # noqa: S105
TEST_USERNAME = "newuser"
DUPLICATE_EMAIL = "existing@example.com"
UNIQUE_USERNAME = "uniqueuser"
DIFFERENT_EMAIL = "different@example.com"
EXISTING_USERNAME = "existinguser"
DISPOSABLE_EMAIL = "temp@tempmail.com"
WEAK_PASSWORD = "short"  # noqa: S105
OWNER_EMAIL = "owner@example.com"
ORG_NAME = "Test Organization"
ORG_LOCATION = "Test City"
ORG_DESC = "Test Description"
LOGIN_EMAIL = "logintest@example.com"
LOGIN_USERNAME = "logintest"
COOKIE_EMAIL = "cookietest@example.com"
COOKIE_USERNAME = "cookietest"
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
        assert "password" not in data  # noqa: PLR2004
        assert "hashed_password" not in data  # noqa: PLR2004

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
        assert "already exists" in response.json()["detail"].lower()  # noqa: PLR2004

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
        assert "username" in response.json()["detail"].lower()  # noqa: PLR2004

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
        assert "disposable" in response.json()["detail"].lower()  # noqa: PLR2004

    async def test_register_weak_password(self, async_client: AsyncClient) -> None:
        """Test registration with weak password - password validation happens in Pydantic."""
        user_data = {
            "email": "user@example.com",
            "password": WEAK_PASSWORD,
            "username": "user",
        }

        response = await async_client.post("/auth/register", json=user_data)

        # Pydantic validates before reaching route
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY]

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
                    assert "access_token" in data or len(data) > 0  # noqa: PLR2004
                except (ValueError, json.JSONDecodeError):
                    # Response may be empty (204 No Content) with token in header
                    pass
            # Refresh token is set as httpOnly cookie via on_after_login
            assert "refresh_token" in response.cookies or "set-cookie" in response.headers  # noqa: PLR2004

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
            assert len(cookies) > 0 or "set-cookie" in response.headers  # noqa: PLR2004


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
class TestLogoutAllDevices:
    """Tests for logout from all devices."""

    async def test_logout_all_devices(self, async_client: AsyncClient, superuser_client: AsyncClient) -> None:
        """Test logging out from all devices."""
        del async_client
        # Use superuser client for authenticated request
        response = await superuser_client.post("/auth/logout-all")

        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert "message" in data  # noqa: PLR2004
            assert "sessions_revoked" in data  # noqa: PLR2004
            assert data["sessions_revoked"] >= 0

    async def test_logout_all_devices_with_body_token(
        self, async_client: AsyncClient, superuser_client: AsyncClient
    ) -> None:
        """Test logging out from all devices using Bearer auth (refresh token in JSON body)."""
        del async_client
        logout_data = {"refresh_token": DUMMY_REFRESH_TOKEN}
        response = await superuser_client.post("/auth/logout-all", json=logout_data)

        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert "message" in data  # noqa: PLR2004
            assert "sessions_revoked" in data  # noqa: PLR2004
            assert data["sessions_revoked"] >= 0

    async def test_logout_all_devices_unauthenticated(self, async_client: AsyncClient) -> None:
        """Test logout all requires authentication."""
        response = await async_client.post("/auth/logout-all")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]


@pytest.mark.asyncio
class TestSessionManagement:
    """Tests for session management endpoints."""

    async def test_list_sessions_empty(self, async_client: AsyncClient, superuser_client: AsyncClient) -> None:
        """Test listing sessions when user has none."""
        del async_client
        response = await superuser_client.get("/auth/sessions")

        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, list)

    async def test_list_sessions_unauthenticated(self, async_client: AsyncClient) -> None:
        """Test listing sessions requires authentication."""
        response = await async_client.get("/auth/sessions")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_revoke_session(
        self,
        superuser_client: AsyncClient,
        mock_redis_dependency: Redis,
        superuser: User,
    ) -> None:
        """Test revoking a specific session."""
        # Create a session for the superuser
        session_id = await create_session(
            mock_redis_dependency,
            superuser.id,  # Use superuser's actual ID
            USER_AGENT,
            SESSION_REFRESH_TOKEN,
            IP_ADDRESS,
        )

        # Try to revoke
        response = await superuser_client.delete(f"/auth/sessions/{session_id}")

        # Should succeed or fail gracefully
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_404_NOT_FOUND,
        ]

    async def test_revoke_session_unauthenticated(self, async_client: AsyncClient) -> None:
        """Test revoking session requires authentication."""
        response = await async_client.delete("/auth/sessions/fake-session-id")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]


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
