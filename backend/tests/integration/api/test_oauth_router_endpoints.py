"""Integration tests for small OAuth router endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

import pytest
from fastapi import FastAPI, status

from app.api.auth.models import OAuthAccount, User
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


def _detail_text(payload: dict[str, object]) -> str:
    """Return a comparable error-detail string across supported error shapes."""
    detail = payload["detail"]
    if isinstance(detail, dict):
        detail_dict = cast("dict[str, object]", detail)
        return str(detail_dict.get("message") or "")
    return str(detail)


@pytest.fixture
async def active_user(db_session: AsyncSession) -> User:
    """Create a regular active user for OAuth route tests."""
    return await UserFactory.create_async(session=db_session, is_superuser=False, is_active=True, is_verified=True)


@pytest.fixture
async def active_user_client(
    api_client: AsyncClient, active_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client acting as a regular active user."""
    with override_authenticated_user(test_app, active_user, optional=False):
        yield api_client


class TestRemoveOAuthAssociation:
    """Tests for DELETE /v1/oauth/{provider}/associate."""

    async def test_rejects_invalid_provider(self, active_user_client: AsyncClient) -> None:
        """Unsupported providers should return a stable 400 response."""
        response = await active_user_client.delete("/v1/oauth/discord/associate")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid oauth provider" in _detail_text(response.json()).lower()

    async def test_returns_404_when_account_not_linked(self, active_user_client: AsyncClient) -> None:
        """Deleting a missing OAuth association should return 404."""
        response = await active_user_client.delete("/v1/oauth/google/associate")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not linked" in _detail_text(response.json()).lower()

    async def test_deletes_existing_oauth_account(
        self,
        active_user_client: AsyncClient,
        active_user: User,
        db_session: AsyncSession,
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
        db_session.add(oauth_account)
        await db_session.flush()

        response = await active_user_client.delete("/v1/oauth/google/associate")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert await db_session.get(OAuthAccount, oauth_account.id) is None
