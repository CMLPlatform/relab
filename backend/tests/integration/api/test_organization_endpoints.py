"""Integration tests for organization API endpoints.

Tests the public organization endpoints (GET, POST, join) using a real
Postgres testcontainer and an authenticated FastAPI test client.
"""
# spell-checker: ignore usefixtures

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, status

from app.api.auth.dependencies import current_active_user, current_active_verified_user
from app.api.auth.models import Organization, OrganizationRole, User
from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlmodel.ext.asyncio.session import AsyncSession


@pytest.fixture
async def verified_user(session: AsyncSession) -> User:
    """Non-superuser verified active user."""
    return await UserFactory.create_async(session=session, is_superuser=False, is_active=True, is_verified=True)


@pytest.fixture
async def verified_user_client(
    async_client: AsyncClient, verified_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client acting as a verified non-superuser."""
    test_app.dependency_overrides[current_active_user] = lambda: verified_user
    test_app.dependency_overrides[current_active_verified_user] = lambda: verified_user
    yield async_client
    test_app.dependency_overrides.pop(current_active_user, None)
    test_app.dependency_overrides.pop(current_active_verified_user, None)


async def _create_org_for_user(session: AsyncSession, owner: User) -> Organization:
    """Create an organization with a real owner."""
    org = await OrganizationFactory.create_async(session=session, owner_id=owner.id)
    owner.organization_id = org.id
    owner.organization_role = OrganizationRole.OWNER
    session.add(owner)
    await session.flush()
    return org


@pytest.fixture
async def org_with_owner(session: AsyncSession, verified_user: User) -> Organization:
    """Create an organization owned by verified_user."""
    return await _create_org_for_user(session, verified_user)


@pytest.mark.integration
class TestGetOrganizations:
    """Tests for GET /organizations."""

    async def test_list_includes_created_org(self, async_client: AsyncClient, session: AsyncSession) -> None:
        """A created org appears in the listing."""
        owner = await UserFactory.create_async(session=session)
        await OrganizationFactory.create_async(session=session, name="Test Corp", owner_id=owner.id)
        response = await async_client.get("/organizations")
        assert response.status_code == status.HTTP_200_OK
        names = [item["name"] for item in response.json()["items"]]
        assert "Test Corp" in names


@pytest.mark.integration
class TestGetOrganizationById:
    """Tests for GET /organizations/{organization_id}."""

    async def test_returns_org_by_id(self, async_client: AsyncClient, session: AsyncSession) -> None:
        """GET /organizations/{id} returns the org."""
        owner = await UserFactory.create_async(session=session)
        org = await OrganizationFactory.create_async(session=session, name="My Org", owner_id=owner.id)
        response = await async_client.get(f"/organizations/{org.id}")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "My Org"

    async def test_returns_404_for_unknown_id(self, async_client: AsyncClient) -> None:
        """GET /organizations/{id} returns 404 for non-existent ID."""
        response = await async_client.get(f"/organizations/{uuid.uuid4()}")
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
class TestCreateOrganization:
    """Tests for POST /organizations."""

    async def test_create_organization_success(self, verified_user_client: AsyncClient, verified_user: User) -> None:
        """A verified user can create an organization."""
        response = await verified_user_client.post("/organizations", json={"name": "New Corp"})
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "New Corp"
        assert data["owner_id"] == str(verified_user.id)

    @pytest.mark.usefixtures("org_with_owner")
    async def test_create_organization_already_member_raises(
        self,
        verified_user_client: AsyncClient,
    ) -> None:
        """A user who already has an org cannot create another."""
        response = await verified_user_client.post("/organizations", json={"name": "Conflict Org"})
        assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.integration
class TestGetOrganizationMembers:
    """Tests for GET /organizations/{id}/members."""

    async def test_member_can_list_members(
        self,
        verified_user_client: AsyncClient,
        org_with_owner: Organization,
    ) -> None:
        """An org member can list the org's members."""
        response = await verified_user_client.get(f"/organizations/{org_with_owner.id}/members")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "items" in data

    async def test_non_member_cannot_list_members(
        self,
        verified_user_client: AsyncClient,
        session: AsyncSession,
        verified_user: User,
    ) -> None:
        """A user from a different org cannot list members (requires org membership)."""
        # Create a second org that verified_user does NOT belong to
        other_owner = await UserFactory.create_async(session=session)
        other_org = await OrganizationFactory.create_async(session=session, owner_id=other_owner.id)
        # Detach verified_user from the org to simulate them belonging to a different one
        verified_user.organization_id = None
        verified_user.organization_role = None
        session.add(verified_user)
        await session.flush()

        response = await verified_user_client.get(f"/organizations/{other_org.id}/members")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_superuser_can_list_any_org_members(
        self,
        superuser_client: AsyncClient,
        session: AsyncSession,
        superuser: User,
    ) -> None:
        """Superuser can list members of any organization."""
        org = await OrganizationFactory.create_async(session=session, owner_id=superuser.id)
        response = await superuser_client.get(f"/organizations/{org.id}/members")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
class TestJoinOrganization:
    """Tests for POST /organizations/{id}/members/me."""

    async def test_user_can_join_organization(
        self,
        verified_user_client: AsyncClient,
        session: AsyncSession,
    ) -> None:
        """A user without an org can join one."""
        other_owner = await UserFactory.create_async(session=session)
        org = await OrganizationFactory.create_async(session=session, owner_id=other_owner.id)
        response = await verified_user_client.post(f"/organizations/{org.id}/members/me")
        assert response.status_code == status.HTTP_201_CREATED
        # User is now linked to the org; verify the response is a user object
        data = response.json()
        assert "email" in data

    @pytest.mark.usefixtures("org_with_owner")
    async def test_owner_can_join_another_org_if_old_org_is_empty(
        self,
        async_client: AsyncClient,
        verified_user_client: AsyncClient,
        session: AsyncSession,
        org_with_owner: Organization,
    ) -> None:
        """An org owner can join another organization if their old org has no other members."""
        other_owner = await UserFactory.create_async(session=session)
        other_org = await OrganizationFactory.create_async(session=session, owner_id=other_owner.id)
        response = await verified_user_client.post(f"/organizations/{other_org.id}/members/me")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["organization"]["name"] == other_org.name

        old_org_response = await async_client.get(f"/organizations/{org_with_owner.id}")
        assert old_org_response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
class TestUpdateOrganization:
    """Tests for PATCH /users/me/organization."""

    async def test_owner_can_transfer_ownership(
        self,
        verified_user_client: AsyncClient,
        session: AsyncSession,
        org_with_owner: Organization,
        verified_user: User,
    ) -> None:
        """The current owner can transfer ownership to another member."""
        new_owner = await UserFactory.create_async(
            session=session,
            organization_id=org_with_owner.id,
            organization_role=OrganizationRole.MEMBER,
        )

        response = await verified_user_client.patch("/users/me/organization", json={"owner_id": str(new_owner.id)})

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["owner_id"] == str(new_owner.id)

        await session.refresh(verified_user)
        await session.refresh(new_owner)
        assert verified_user.organization_role == OrganizationRole.MEMBER
        assert new_owner.organization_role == OrganizationRole.OWNER

    async def test_owner_cannot_transfer_to_non_member(
        self,
        verified_user_client: AsyncClient,
        session: AsyncSession,
    ) -> None:
        """The current owner cannot transfer ownership to a user outside the org."""
        outsider = await UserFactory.create_async(session=session)

        response = await verified_user_client.patch("/users/me/organization", json={"owner_id": str(outsider.id)})

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.integration
class TestUserOrganizationMembers:
    """Tests for GET /users/me/organization/members."""

    async def test_returns_404_when_user_has_no_organization(
        self,
        verified_user_client: AsyncClient,
    ) -> None:
        """Users without an organization should get a stable 404 response."""
        response = await verified_user_client.get("/users/me/organization/members")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "organization" in response.json()["detail"]["message"].lower()
