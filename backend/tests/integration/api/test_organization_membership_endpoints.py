"""Behavior-focused tests for organization membership endpoints."""
# ruff: noqa: D101, D102
# spell-checker: ignore usefixtures

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.auth.models import OrganizationRole
from tests.factories.models import OrganizationFactory, UserFactory
from tests.integration.api._organization_support import detail_text

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import Organization, User

pytest_plugins = ("tests.integration.api._organization_support",)

pytestmark = pytest.mark.integration


class TestGetOrganizationMembers:
    async def test_member_can_list_members(
        self, verified_user_client: AsyncClient, org_with_owner: Organization
    ) -> None:
        response = await verified_user_client.get(f"/organizations/{org_with_owner.id}/members")

        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()

    async def test_non_member_cannot_list_members(
        self,
        verified_user_client: AsyncClient,
        db_session: AsyncSession,
        verified_user: User,
    ) -> None:
        other_owner = await UserFactory.create_async(session=db_session)
        other_org = await OrganizationFactory.create_async(session=db_session, owner_id=other_owner.id)
        verified_user.organization_id = None
        verified_user.organization_role = None
        db_session.add(verified_user)
        await db_session.flush()

        response = await verified_user_client.get(f"/organizations/{other_org.id}/members")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_superuser_can_list_any_org_members(
        self,
        api_client_superuser: AsyncClient,
        db_session: AsyncSession,
        db_superuser: User,
    ) -> None:
        org = await OrganizationFactory.create_async(session=db_session, owner_id=db_superuser.id)
        response = await api_client_superuser.get(f"/organizations/{org.id}/members")
        assert response.status_code == status.HTTP_200_OK


class TestJoinOrganization:
    async def test_user_can_join_organization(
        self,
        verified_user_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        other_owner = await UserFactory.create_async(session=db_session)
        org = await OrganizationFactory.create_async(session=db_session, owner_id=other_owner.id)

        response = await verified_user_client.post(f"/organizations/{org.id}/members/me")

        assert response.status_code == status.HTTP_201_CREATED
        assert "email" in response.json()

    @pytest.mark.usefixtures("org_with_owner")
    async def test_owner_can_join_another_org_if_old_org_is_empty(
        self,
        api_client: AsyncClient,
        verified_user_client: AsyncClient,
        db_session: AsyncSession,
        org_with_owner: Organization,
    ) -> None:
        other_owner = await UserFactory.create_async(session=db_session)
        other_org = await OrganizationFactory.create_async(session=db_session, owner_id=other_owner.id)

        response = await verified_user_client.post(f"/organizations/{other_org.id}/members/me")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["organization"]["name"] == other_org.name

        old_org_response = await api_client.get(f"/organizations/{org_with_owner.id}")
        assert old_org_response.status_code == status.HTTP_404_NOT_FOUND


class TestUpdateOrganization:
    async def test_owner_can_transfer_ownership(
        self,
        verified_user_client: AsyncClient,
        db_session: AsyncSession,
        org_with_owner: Organization,
        verified_user: User,
    ) -> None:
        new_owner = await UserFactory.create_async(
            session=db_session,
            organization_id=org_with_owner.id,
            organization_role=OrganizationRole.MEMBER,
        )

        response = await verified_user_client.patch("/users/me/organization", json={"owner_id": str(new_owner.id)})

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["owner_id"] == str(new_owner.id)

        await db_session.refresh(verified_user)
        await db_session.refresh(new_owner)
        assert verified_user.organization_role == OrganizationRole.MEMBER
        assert new_owner.organization_role == OrganizationRole.OWNER

    async def test_owner_cannot_transfer_to_non_member(
        self,
        verified_user_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        outsider = await UserFactory.create_async(session=db_session)

        response = await verified_user_client.patch("/users/me/organization", json={"owner_id": str(outsider.id)})

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestUserOrganizationMembers:
    async def test_returns_404_when_user_has_no_organization(self, verified_user_client: AsyncClient) -> None:
        response = await verified_user_client.get("/users/me/organization/members")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "organization" in detail_text(response.json()).lower()
