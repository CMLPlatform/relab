"""Refresh-token endpoint integration tests."""

# ruff: noqa: D102

from __future__ import annotations

from http.cookies import SimpleCookie
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.auth.services.refresh_token_service import create_refresh_token
from tests.factories.models import UserFactory

from .shared import INVALID_REFRESH_TOKEN

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
class TestRefreshTokenEndpoint:
    """Tests for custom refresh token endpoints."""

    async def test_cookie_refresh_token_requires_cookie(
        self, async_client: AsyncClient, mock_redis_dependency: Redis
    ) -> None:
        del mock_redis_dependency
        response = await async_client.post("/auth/cookie/refresh")
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_bearer_refresh_token_invalid(self, async_client: AsyncClient, mock_redis_dependency: Redis) -> None:
        del mock_redis_dependency
        response = await async_client.post("/auth/refresh", json={"refresh_token": INVALID_REFRESH_TOKEN})
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_bearer_refresh_rotates_and_replay_fails(
        self,
        async_client: AsyncClient,
        mock_redis_dependency: Redis,
        session: AsyncSession,
    ) -> None:
        user = await UserFactory.create_async(
            session,
            email="refresh-rotation@example.com",
            username="refresh_rotation_user",
            hashed_password="pw",
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        response = await async_client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        new_refresh_token = data["refresh_token"]
        assert new_refresh_token != old_refresh_token

        replay_response = await async_client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
        assert replay_response.status_code == status.HTTP_401_UNAUTHORIZED

        second_refresh = await async_client.post("/auth/refresh", json={"refresh_token": new_refresh_token})
        assert second_refresh.status_code == status.HTTP_200_OK

    async def test_cookie_refresh_rotates_and_replay_fails(
        self,
        async_client: AsyncClient,
        mock_redis_dependency: Redis,
        session: AsyncSession,
    ) -> None:
        user = await UserFactory.create_async(
            session,
            email="cookie-refresh-rotation@example.com",
            username="cookie_refresh_rotation_user",
            hashed_password="pw",
            is_active=True,
            is_verified=True,
        )
        assert user.id is not None

        old_refresh_token = await create_refresh_token(mock_redis_dependency, user.id)

        async_client.cookies.set("refresh_token", old_refresh_token)
        first_response = await async_client.post("/auth/cookie/refresh")
        assert first_response.status_code == status.HTTP_204_NO_CONTENT

        parsed_cookies = SimpleCookie()
        for header in first_response.headers.get_list("set-cookie"):
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

        async_client.cookies.clear()
