"""Integration tests for small OAuth router endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, status

from app.api.auth.dependencies import current_active_user
from app.api.auth.models import OAuthAccount, User
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.fixture
async def active_user(session: AsyncSession) -> User:
    """Create a regular active user for OAuth route tests."""
    return await UserFactory.create_async(session=session, is_superuser=False, is_active=True, is_verified=True)


@pytest.fixture
async def active_user_client(
    async_client: AsyncClient, active_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client acting as a regular active user."""
    test_app.dependency_overrides[current_active_user] = lambda: active_user
    yield async_client
    test_app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.integration
class TestRemoveOAuthAssociation:
    """Tests for DELETE /auth/oauth/{provider}/associate."""

    async def test_rejects_invalid_provider(self, active_user_client: AsyncClient) -> None:
        """Unsupported providers should return a stable 400 response."""
        response = await active_user_client.delete("/auth/oauth/discord/associate")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid oauth provider" in response.json()["detail"]["message"].lower()

    async def test_returns_404_when_account_not_linked(self, active_user_client: AsyncClient) -> None:
        """Deleting a missing OAuth association should return 404."""
        response = await active_user_client.delete("/auth/oauth/google/associate")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not linked" in response.json()["detail"]["message"].lower()

    async def test_deletes_existing_oauth_account(
        self,
        active_user_client: AsyncClient,
        active_user: User,
        session: AsyncSession,
    ) -> None:
        """Deleting a linked OAuth account should remove it from the database."""
        oauth_account = OAuthAccount(
            user_id=active_user.id,
            oauth_name="google",
            access_token="access-token",
            expires_at=None,
            refresh_token=None,
            account_id="provider-user-123",
            account_email=active_user.email,
        )
        session.add(oauth_account)
        await session.flush()

        response = await active_user_client.delete("/auth/oauth/google/associate")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert await session.get(OAuthAccount, oauth_account.id) is None
