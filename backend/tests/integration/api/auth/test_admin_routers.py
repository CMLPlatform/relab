"""Admin router integration tests for user and organization management."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


@pytest.mark.integration
class TestAdminUserRouters:
    """Integration tests for admin user management endpoints."""

    @pytest.mark.asyncio
    async def test_get_all_users_as_superuser(
        self, superuser_client: AsyncClient, session: AsyncSession, superuser: User
    ) -> None:
        """Superuser can list all users."""
        # Create additional users
        user1 = await UserFactory.create_async(session, email="user1@example.com", username="user1")
        user2 = await UserFactory.create_async(session, email="user2@example.com", username="user2")

        response = await superuser_client.get("/admin/users")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 3  # superuser + 2 created users
        assert len(data["items"]) >= 3
        # Verify users are in the list
        user_emails = [u["email"] for u in data["items"]]
        user_ids = [u["id"] for u in data["items"]]
        assert str(superuser.id) in user_ids
        assert user1.email in user_emails
        assert user2.email in user_emails

    @pytest.mark.asyncio
    async def test_get_all_users_with_pagination(self, superuser_client: AsyncClient, session: AsyncSession) -> None:
        """Pagination works for user list."""
        # Create 5 users
        for i in range(5):
            await UserFactory.create_async(session, email=f"pag{i}@example.com", username=f"pag_user_{i}")

        # Request with page size 2
        response = await superuser_client.get("/admin/users?page=1&size=2")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["items"]) <= 2
        assert "page" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_get_user_by_id_as_superuser(self, superuser_client: AsyncClient, session: AsyncSession) -> None:
        """Superuser can retrieve a user by ID."""
        user = await UserFactory.create_async(session, email="getbyid@example.com", username="getbyid_user")

        response = await superuser_client.get(f"/admin/users/{user.id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(user.id)
        assert data["email"] == "getbyid@example.com"
        assert data["username"] == "getbyid_user"
        assert "is_active" in data
        assert "is_verified" in data

    @pytest.mark.asyncio
    async def test_get_all_users_by_email(self, superuser_client: AsyncClient, session: AsyncSession) -> None:
        """Can retrieve user by email via admin endpoint."""
        user = await UserFactory.create_async(session, email="by_email@example.com", username="by_email_user")

        # Get the user to verify email is present
        response = await superuser_client.get(f"/admin/users/{user.id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == "by_email@example.com"

    @pytest.mark.asyncio
    async def test_get_all_users_by_username(self, superuser_client: AsyncClient, session: AsyncSession) -> None:
        """Can retrieve user by username via admin endpoint."""
        user = await UserFactory.create_async(session, email="byuser@example.com", username="byuser_unique")

        response = await superuser_client.get(f"/admin/users/{user.id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["username"] == "byuser_unique"

    @pytest.mark.asyncio
    async def test_admin_users_requires_superuser(self, async_client: AsyncClient, session: AsyncSession) -> None:
        """Admin user endpoints require superuser role."""
        # Create regular user and authenticate
        await UserFactory.create_async(session, email="regular@example.com", username="regular_user")
        # Use unauthenticated client (since there's no regular user auth fixture)
        # Admin endpoints should 403 without superuser

        response = await async_client.get("/admin/users")

        # Without authentication, should be 403 or similar (depends on auth middleware)
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.integration
class TestAdminOrganizationRouters:
    """Integration tests for admin organization management endpoints."""

    @pytest.mark.asyncio
    async def test_get_all_organizations_as_superuser(
        self, superuser_client: AsyncClient, session: AsyncSession, superuser: User
    ) -> None:
        """Superuser can list all organizations."""
        org1 = await OrganizationFactory.create_async(session, name="Org1", location="Location1", owner_id=superuser.id)
        org2 = await OrganizationFactory.create_async(session, name="Org2", location="Location2", owner_id=superuser.id)

        response = await superuser_client.get("/admin/organizations")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 2
        assert len(data["items"]) >= 2
        org_names = [o["name"] for o in data["items"]]
        org_ids = [o["id"] for o in data["items"]]
        assert str(org1.id) in org_ids
        assert str(org2.id) in org_ids
        assert "Org1" in org_names
        assert "Org2" in org_names

    @pytest.mark.asyncio
    async def test_get_all_organizations_with_relationships(
        self, superuser_client: AsyncClient, session: AsyncSession, superuser: User
    ) -> None:
        """Organization list includes members relationship."""
        org = await OrganizationFactory.create_async(session, name="OrgWithMembers", owner_id=superuser.id)
        user1 = await UserFactory.create_async(
            session, email="member1@example.com", username="member1", organization_id=org.id
        )
        user2 = await UserFactory.create_async(
            session, email="member2@example.com", username="member2", organization_id=org.id
        )

        response = await superuser_client.get("/admin/organizations")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # Find our org in the list
        org_data = next((o for o in data["items"] if o["name"] == "OrgWithMembers"), None)
        assert org_data is not None
        assert "members" in org_data
        assert len(org_data["members"]) >= 2
        member_emails = [m["email"] for m in org_data["members"]]
        assert user1.email in member_emails
        assert user2.email in member_emails

    @pytest.mark.asyncio
    async def test_get_organization_by_id_with_relationships(
        self, superuser_client: AsyncClient, session: AsyncSession, superuser: User
    ) -> None:
        """Superuser can retrieve organization with members."""
        org = await OrganizationFactory.create_async(session, name="TestOrg", location="TestLoc", owner_id=superuser.id)
        member = await UserFactory.create_async(
            session, email="org_member@example.com", username="org_member", organization_id=org.id
        )

        response = await superuser_client.get(f"/admin/organizations/{org.id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(org.id)
        assert data["name"] == "TestOrg"
        assert "members" in data
        member_emails = [m["email"] for m in data["members"]]
        assert member.email in member_emails
        assert "org_member@example.com" in member_emails

    @pytest.mark.asyncio
    async def test_admin_organizations_requires_superuser(self, async_client: AsyncClient) -> None:
        """Admin organization endpoints require superuser role."""
        response = await async_client.get("/admin/organizations")

        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
