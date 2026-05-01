"""Admin router integration tests for user management."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


pytestmark = pytest.mark.api


class TestAdminUserRouters:
    """Integration tests for admin user management endpoints."""

    async def test_get_all_users_as_superuser(
        self, api_client_superuser_light: AsyncClient, db_session: AsyncSession, db_superuser: User
    ) -> None:
        """Superuser can list all users."""
        # Create additional users
        user1 = await UserFactory.create_async(db_session, email="user1@example.com", username="user1")
        user2 = await UserFactory.create_async(db_session, email="user2@example.com", username="user2")

        response = await api_client_superuser_light.get("/v1/admin/users")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 3  # superuser + 2 created users
        assert len(data["items"]) >= 3
        # Verify users are in the list
        user_emails = [u["email"] for u in data["items"]]
        user_ids = [u["id"] for u in data["items"]]
        assert str(db_superuser.id) in user_ids
        assert user1.email in user_emails
        assert user2.email in user_emails

    async def test_get_all_users_with_pagination(
        self, api_client_superuser_light: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Pagination works for user list."""
        # Create 5 users
        for i in range(5):
            await UserFactory.create_async(db_session, email=f"pag{i}@example.com", username=f"pag_user_{i}")

        # Request with page size 2
        response = await api_client_superuser_light.get("/v1/admin/users?page=1&size=2")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["items"]) <= 2
        assert "page" in data
        assert "total" in data

    async def test_get_user_by_id_as_superuser(
        self, api_client_superuser: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Superuser can retrieve a user by ID."""
        user = await UserFactory.create_async(db_session, email="getbyid@example.com", username="getbyid_user")

        response = await api_client_superuser.get(f"/v1/admin/users/{user.id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(user.id)
        assert data["email"] == "getbyid@example.com"
        assert data["username"] == "getbyid_user"
        assert "is_active" in data
        assert "is_verified" in data

    async def test_admin_users_requires_superuser(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        """Admin user endpoints require superuser role."""
        # Create regular user and authenticate
        await UserFactory.create_async(db_session, email="regular@example.com", username="regular_user")
        # Use unauthenticated client (since there's no regular user auth fixture)
        # Admin endpoints should 403 without superuser

        response = await api_client.get("/v1/admin/users")

        # Without authentication, should be 403 or similar (depends on auth middleware)
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
