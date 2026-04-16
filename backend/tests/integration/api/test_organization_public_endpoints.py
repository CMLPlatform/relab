"""Behavior-focused tests for public organization endpoints."""
# ruff: noqa: D101, D102
# spell-checker: ignore usefixtures

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytest_plugins = ("tests.integration.api._organization_support",)

pytestmark = pytest.mark.integration


class TestGetOrganizations:
    async def test_list_includes_created_org(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        owner = await UserFactory.create_async(session=db_session)
        await OrganizationFactory.create_async(session=db_session, name="Test Corp", owner_id=owner.id)

        response = await api_client.get("/organizations")

        assert response.status_code == status.HTTP_200_OK
        names = [item["name"] for item in response.json()["items"]]
        assert "Test Corp" in names


class TestGetOrganizationById:
    async def test_returns_org_by_id(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        owner = await UserFactory.create_async(session=db_session)
        org = await OrganizationFactory.create_async(session=db_session, name="My Org", owner_id=owner.id)

        response = await api_client.get(f"/organizations/{org.id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "My Org"

    async def test_returns_404_for_unknown_id(self, api_client: AsyncClient) -> None:
        response = await api_client.get(f"/organizations/{uuid.uuid4()}")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestCreateOrganization:
    async def test_create_organization_success(
        self, verified_user_client: AsyncClient, verified_user: User
    ) -> None:
        response = await verified_user_client.post("/organizations", json={"name": "New Corp"})

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "New Corp"
        assert data["owner_id"] == str(verified_user.id)

    @pytest.mark.usefixtures("org_with_owner")
    async def test_create_organization_already_member_raises(self, verified_user_client: AsyncClient) -> None:
        response = await verified_user_client.post("/organizations", json={"name": "Conflict Org"})
        assert response.status_code == status.HTTP_409_CONFLICT
