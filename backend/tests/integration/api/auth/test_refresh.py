"""Refresh-token endpoint integration tests."""

from __future__ import annotations

from http.cookies import SimpleCookie
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.auth.services.refresh_token_service import create_refresh_token, refresh_token_fingerprint
from tests.factories.models import UserFactory

from .shared import INVALID_REFRESH_TOKEN, hash_test_password

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


pytestmark = pytest.mark.api


class TestRefreshTokenEndpoint:
    """Tests for custom refresh token endpoints."""

    async def test_session_refresh_token_requires_cookie(
        self, api_client: AsyncClient, mock_redis_dependency: Redis
    ) -> None:
        """Test that the session refresh endpoint requires a refresh token cookie."""
        del mock_redis_dependency
        response = await api_client.post("/v1/auth/session/refresh")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_bearer_refresh_token_invalid(self, api_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        """Test that the bearer refresh endpoint rejects invalid refresh tokens."""
        del mock_redis_dependency
        response = await api_client.post("/v1/auth/bearer/refresh", json={"refresh_token": INVALID_REFRESH_TOKEN})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_bearer_refresh_requires_json_body_even_when_cookie_present(
        self,
        api_client: AsyncClient,
        mock_redis_dependency: Redis,
        db_session: AsyncSession,
    ) -> None:
        """Bearer refresh should not accept refresh tokens through cookies."""
        user = await UserFactory.create_async(
            db_session,
            email="bearer-cookie-ignored@example.com",
            username="bearer_cookie_ignored",
        )
        refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        api_client.cookies.set("refresh_token", refresh_token)
        response = await api_client.post("/v1/auth/bearer/refresh")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_session_refresh_requires_cookie_even_when_json_body_present(
        self,
        api_client: AsyncClient,
        mock_redis_dependency: Redis,
        db_session: AsyncSession,
    ) -> None:
        """Session refresh should not accept refresh tokens through JSON."""
        user = await UserFactory.create_async(
            db_session,
            email="session-json-ignored@example.com",
            username="session_json_ignored",
        )
        refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        response = await api_client.post("/v1/auth/session/refresh", json={"refresh_token": refresh_token})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_bearer_refresh_rotates_and_replay_fails(
        self,
        api_client: AsyncClient,
        mock_redis_dependency: Redis,
        db_session: AsyncSession,
    ) -> None:
        """Test that the bearer refresh endpoint rotates refresh tokens and prevents replay."""
        user = await UserFactory.create_async(
            db_session,
            email="refresh-rotation@example.com",
            username="refresh_rotation_user",
            hashed_password=hash_test_password("pw"),
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        response = await api_client.post("/v1/auth/bearer/refresh", json={"refresh_token": old_refresh_token})
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        new_refresh_token = data["refresh_token"]
        assert new_refresh_token != old_refresh_token

        replay_response = await api_client.post("/v1/auth/bearer/refresh", json={"refresh_token": old_refresh_token})
        assert replay_response.status_code == status.HTTP_401_UNAUTHORIZED

        second_refresh = await api_client.post("/v1/auth/bearer/refresh", json={"refresh_token": new_refresh_token})
        assert second_refresh.status_code == status.HTTP_200_OK

    async def test_session_refresh_rotates_and_replay_fails(
        self,
        api_client: AsyncClient,
        mock_redis_dependency: Redis,
        db_session: AsyncSession,
    ) -> None:
        """Test that the session refresh endpoint rotates refresh tokens and prevents replay."""
        user = await UserFactory.create_async(
            db_session,
            email="cookie-refresh-rotation@example.com",
            username="cookie_refresh_rotation_user",
            hashed_password=hash_test_password("pw"),
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        api_client.cookies.set("refresh_token", old_refresh_token)
        first_response = await api_client.post("/v1/auth/session/refresh")
        assert first_response.status_code == status.HTTP_204_NO_CONTENT

        parsed_cookies = SimpleCookie()
        for header in first_response.headers.get_list("set-cookie"):
            parsed_cookies.load(header)

        assert "refresh_token" in parsed_cookies
        new_refresh_token = parsed_cookies["refresh_token"].value
        assert new_refresh_token
        assert new_refresh_token != old_refresh_token

        api_client.cookies.clear()
        api_client.cookies.set("refresh_token", old_refresh_token)
        replay_response = await api_client.post("/v1/auth/session/refresh")
        assert replay_response.status_code == status.HTTP_401_UNAUTHORIZED

        api_client.cookies.clear()
        api_client.cookies.set("refresh_token", new_refresh_token)
        second_response = await api_client.post("/v1/auth/session/refresh")
        assert second_response.status_code == status.HTTP_204_NO_CONTENT

        api_client.cookies.clear()

    async def test_revoke_all_sessions_revokes_refresh_tokens_and_clears_browser_state(
        self,
        api_client_user: AsyncClient,
        mock_redis_dependency: Redis,
        db_user: User,
    ) -> None:
        """Authenticated users can invalidate all refresh tokens for their account."""
        refresh_token = await create_refresh_token(mock_redis_dependency, db_user.id)

        response = await api_client_user.post("/v1/auth/sessions/revoke-all")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.headers["clear-site-data"] == '"cache", "cookies", "storage"'
        assert await mock_redis_dependency.exists(f"auth:rt_blacklist:{refresh_token_fingerprint(refresh_token)}")
        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any(header.startswith("auth=") for header in set_cookie_headers)
        assert any(header.startswith("refresh_token=") for header in set_cookie_headers)

    async def test_revoke_all_sessions_requires_authentication(self, api_client: AsyncClient) -> None:
        """Remote session invalidation is only available to active users."""
        response = await api_client.post("/v1/auth/sessions/revoke-all")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
