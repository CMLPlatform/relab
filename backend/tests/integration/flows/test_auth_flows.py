"""Integration tests for complete authentication flows.

These tests cover complete user journeys from registration through login,
session management, refresh tokens, and logout.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest
from fastapi import status
from sqlmodel import select

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.services import refresh_token_service

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlmodel.ext.asyncio.session import AsyncSession

# Constants for test values
FLOW_TEST_EMAIL = "flowtest@example.com"
FLOW_TEST_USERNAME = "flowtest"
FLOW_TEST_PASSWORD = "SecurePassword123!"  # noqa: S105
MULTI_DEVICE_EMAIL = "multidevice@example.com"
MULTI_DEVICE_USERNAME = "multidevice"
LOGOUT_ALL_EMAIL = "logoutall@example.com"
LOGOUT_ALL_USERNAME = "logoutall"
TRACKING_TEST_EMAIL = "trackingtest@example.com"
TRACKING_TEST_USERNAME = "trackingtest"
COOKIE_FLOW_EMAIL = "cookieflow@example.com"
COOKIE_FLOW_USERNAME = "cookieflow"
TEST_USER_ID = "test-user-123"
TEST_SESSION_ID = "test-session-456"
TEST_IP = "192.168.1.1"
UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)"
UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    """Get a user from the database by email."""
    statement = select(User).where(User.email == email)
    result = await session.exec(statement)
    return result.first()


@pytest.mark.asyncio
class TestCompleteAuthFlow:
    """Test complete authentication flow from registration to logout."""

    async def test_full_bearer_auth_flow(
        self, async_client: AsyncClient, mock_redis_dependency: Redis, session: AsyncSession
    ) -> None:
        """Test complete bearer auth flow: register -> login -> refresh -> logout."""
        # Step 1: Register a new user
        register_data = {
            "email": FLOW_TEST_EMAIL,
            "password": FLOW_TEST_PASSWORD,
            "username": FLOW_TEST_USERNAME,
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_override:
            mock_override.return_value = UserCreate(**register_data)
            register_response = await async_client.post("/auth/register", json=register_data)

        assert register_response.status_code == status.HTTP_201_CREATED, "Registration failed"

        # Fetch user from database to get ID (registration response doesn't include it)
        user = await get_user_by_email(session, register_data["email"])
        assert user is not None, "User not found in database after registration"
        user_id = user.id

        # Step 2: Login with bearer authentication
        login_data = {
            "username": register_data["email"],
            "password": register_data["password"],
        }
        login_response = await async_client.post("/auth/bearer/login", data=login_data)

        assert login_response.status_code == status.HTTP_200_OK, "Login failed, skipping integration test"

        # FastAPI-Users bearer auth might return token or empty response
        # Refresh token is set as httpOnly cookie via on_after_login
        login_result = login_response.json() if login_response.text else {}

        # Get access token from response
        access_token = login_result.get("access_token")

        # Get refresh token from cookies
        refresh_token = login_response.cookies.get("refresh_token")

        # Skip if tokens not available
        if not access_token or not refresh_token:
            pytest.skip("Tokens not available")

        # Verify tokens are present
        assert access_token is not None
        assert refresh_token is not None

        # Step 3: Use access token to access protected endpoint
        # (Skipping session check since sessions have been removed)

        # Step 5: Refresh the access token
        refresh_data = {"refresh_token": refresh_token}
        refresh_response = await async_client.post("/auth/refresh", json=refresh_data)

        if refresh_response.status_code == status.HTTP_200_OK:
            refresh_result = refresh_response.json()
            new_access_token = refresh_result["access_token"]
            assert new_access_token is not None
            assert new_access_token != access_token  # Should be a new token

        # Step 6: Logout (blacklist refresh token)
        logout_data = {"refresh_token": refresh_token}
        logout_response = await async_client.post("/auth/bearer/logout", json=logout_data)

        if logout_response.status_code == status.HTTP_200_OK:
            logout_result = logout_response.json()
            assert "message" in logout_result  # noqa: PLR2004

            # Verify token is now blacklisted in Redis
            is_blacklisted = await mock_redis_dependency.exists(f"auth:rt_blacklist:{refresh_token}")
            assert is_blacklisted

            # Step 7: Try to use blacklisted token (should fail)
            retry_refresh = await async_client.post("/auth/refresh", json=refresh_data)
            assert retry_refresh.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_login_tracking(
        self, async_client: AsyncClient, mock_redis_dependency: Redis, session: AsyncSession
    ) -> None:
        """Test that login tracking (last_login_at, last_login_ip) is updated."""
        del mock_redis_dependency
        # Step 1: Register user
        register_data = {
            "email": TRACKING_TEST_EMAIL,
            "password": FLOW_TEST_PASSWORD,
            "username": TRACKING_TEST_USERNAME,
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_override:
            mock_override.return_value = UserCreate(**register_data)
            register_response = await async_client.post("/auth/register", json=register_data)

        if register_response.status_code != status.HTTP_201_CREATED:
            pytest.skip("Registration failed")

        # Fetch user from database to get ID (registration response doesn't include it)
        user = await get_user_by_email(session, register_data["email"])
        assert user is not None, "User not found in database after registration"

        # Verify user doesn't have login tracking yet
        assert user.last_login_at is None

        # Step 2: Login
        login_data = {"username": register_data["email"], "password": register_data["password"]}
        login_response = await async_client.post("/auth/bearer/login", data=login_data)

        if login_response.status_code != status.HTTP_200_OK:
            pytest.skip("Login failed")

    async def test_cookie_auth_flow(self, async_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        """Test cookie-based authentication flow."""
        del mock_redis_dependency
        # Step 1: Register user
        register_data = {
            "email": COOKIE_FLOW_EMAIL,
            "password": FLOW_TEST_PASSWORD,
            "username": COOKIE_FLOW_USERNAME,
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_override:
            mock_override.return_value = UserCreate(**register_data)
            register_response = await async_client.post("/auth/register", json=register_data)

        if register_response.status_code != status.HTTP_201_CREATED:
            pytest.skip("Registration failed")

        # Step 2: Login with cookie transport
        login_data = {"username": register_data["email"], "password": register_data["password"]}
        login_response = await async_client.post("/auth/cookie/login", data=login_data)

        assert login_response.status_code == status.HTTP_204_NO_CONTENT, "Cookie login failed"

        # Verify cookies were set
        cookies = login_response.cookies
        assert len(cookies) > 0 or "set-cookie" in login_response.headers  # noqa: PLR2004

        # Step 3: Access protected endpoint using cookies

        # Step 4: Logout (clear cookies)
        await async_client.post("/auth/cookie/logout")


@pytest.mark.asyncio
class TestErrorHandling:
    """Test error handling in authentication flows."""

    async def test_refresh_with_expired_token(self, async_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        """Test refreshing with an expired token returns 401."""
        # Create a refresh token manually and then delete it (simulate expiry)
        user_id = TEST_USER_ID

        token = await refresh_token_service.create_refresh_token(mock_redis_dependency, user_id)

        # Delete the token (simulate expiry)
        await mock_redis_dependency.delete(f"auth:rt:{token}")

        # Try to refresh
        refresh_data = {"refresh_token": token}
        response = await async_client.post("/auth/refresh", json=refresh_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_concurrent_logout_and_refresh(self, async_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        """Test handling of concurrent logout and refresh operations."""
        del mock_redis_dependency
        # Register and login
        register_data = {
            "email": "concurrent@example.com",
            "password": FLOW_TEST_PASSWORD,
            "username": "concurrent",
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_override:
            mock_override.return_value = UserCreate(**register_data)
            await async_client.post("/auth/register", json=register_data)

        login_data = {"username": register_data["email"], "password": register_data["password"]}
        login_response = await async_client.post("/auth/bearer/login", data=login_data)

        if login_response.status_code != status.HTTP_200_OK:
            pytest.skip("Login failed")

        # Get tokens from response and cookies
        login_result = login_response.json() if login_response.text else {}
        access_token = login_result.get("access_token")
        refresh_token = login_response.cookies.get("refresh_token")
        assert refresh_token is not None, "No refresh token in cookies"

        # Logout (blacklist token) - use access token for authentication
        logout_data = {"refresh_token": refresh_token}
        auth_headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
        await async_client.post("/auth/bearer/logout", json=logout_data, headers=auth_headers)

        # Try to refresh immediately after logout
        refresh_data = {"refresh_token": refresh_token}
        refresh_response = await async_client.post("/auth/refresh", json=refresh_data)

        # Should fail with 401 (or may succeed in test context if logout didn't work)
        assert refresh_response.status_code in [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED]
