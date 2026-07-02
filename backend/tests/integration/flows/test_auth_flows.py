"""Integration tests for complete authentication flows.

These tests cover complete user journeys from registration through login,
session management, refresh tokens, and logout.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest
from fastapi import status
from sqlalchemy import select

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.services.token_store import token_key
from tests.integration.api.auth.shared import login_bearer

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.flow

# Constants for test values
FLOW_TEST_EMAIL = "flowtest@example.com"
FLOW_TEST_USERNAME = "flowtest"
FLOW_TEST_PASSWORD = "correct-horse-battery-staple-v42"


async def get_user_by_email(db_session: AsyncSession, email: str) -> User | None:
    """Get a user from the database by email."""
    statement = select(User).where(User.email == email)
    result = await db_session.execute(statement)
    return result.scalars().first()


async def register_user(api_client: AsyncClient, *, email: str, password: str, username: str) -> None:
    """Register a user, bypassing the email verification requirement in validate_user_create."""
    register_data = {"email": email, "password": password, "username": username}

    with patch("app.api.auth.routers.register.validate_user_create") as mock_override:
        mock_override.return_value = UserCreate(email=email, password=password, username=username)
        register_response = await api_client.post("/v1/auth/register", json=register_data)

    assert register_response.status_code == status.HTTP_201_CREATED, "Registration failed"


async def test_full_bearer_auth_flow(
    api_client: AsyncClient, mock_redis_dependency: Redis, db_session: AsyncSession
) -> None:
    """Test complete bearer auth flow: register -> login -> refresh -> logout."""
    # Step 1: Register a new user
    await register_user(api_client, email=FLOW_TEST_EMAIL, password=FLOW_TEST_PASSWORD, username=FLOW_TEST_USERNAME)

    # Fetch user from database to verify registration
    user = await get_user_by_email(db_session, FLOW_TEST_EMAIL)
    assert user is not None, "User not found in database after registration"

    # Step 2: Login with bearer authentication.
    login_result = await login_bearer(api_client, email=FLOW_TEST_EMAIL, password=FLOW_TEST_PASSWORD)

    access_token = login_result.get("access_token")
    refresh_token = login_result.get("refresh_token")

    # Verify tokens are present
    assert access_token is not None
    assert refresh_token is not None

    # Step 3: Refresh the access token
    refresh_data = {"refresh_token": refresh_token}
    refresh_response = await api_client.post("/v1/auth/bearer/refresh", json=refresh_data)
    assert refresh_response.status_code == status.HTTP_200_OK
    refresh_result = refresh_response.json()
    new_access_token = refresh_result["access_token"]
    assert new_access_token is not None
    assert new_access_token != access_token  # Should be a new token

    # Step 4: Logout through the custom auth route so the refresh cookie is blacklisted too.
    logout_response = await api_client.post(
        "/v1/auth/bearer/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_response.status_code == status.HTTP_204_NO_CONTENT

    # Verify token is now blacklisted in Redis
    is_blacklisted = await mock_redis_dependency.exists(token_key("auth:rt_blacklist", refresh_token))
    assert is_blacklisted

    # Step 5: Try to use blacklisted token (should fail)
    retry_refresh = await api_client.post("/v1/auth/bearer/refresh", json=refresh_data)
    assert retry_refresh.status_code == status.HTTP_401_UNAUTHORIZED
