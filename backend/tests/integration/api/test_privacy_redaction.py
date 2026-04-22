"""Integration tests for the 3-tier privacy system."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from fastapi import FastAPI, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.background_data.models import ProductType
from app.api.data_collection.models.product import Product
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient


@pytest.fixture
async def setup_data(db_session: AsyncSession, db_superuser: User) -> dict[str, Any]:
    """Set up test products and users.

    Returns a dict with keys: `user`, `other_user`, `superuser`, `product`.
    """
    pt = ProductType(name="Power Tool", description="Handheld electric tools for construction and DIY")
    # Using explicit usernames to avoid collisions and ensure searchability
    user = await UserFactory.create_async(session=db_session, is_active=True, username="privacy_test_user")
    product = Product(owner_id=user.id, product_type=pt, name="User Product")

    # Add another user for "Community" testing
    other_user = await UserFactory.create_async(session=db_session, is_active=True, username="other_user")
    db_session.add_all([pt, product])
    await db_session.flush()

    return {"user": user, "other_user": other_user, "superuser": db_superuser, "product": product}


async def set_profile_visibility(db_session: AsyncSession, user: User, visibility: str) -> None:
    """Persist a profile visibility setting for a user."""
    user.preferences = {"profile_visibility": visibility}
    await db_session.flush()


@pytest.fixture
async def owner_client(
    api_client_light: AsyncClient, setup_data: dict[str, Any], test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide an authenticated client for the private-profile owner.

    The fixture overrides authentication dependencies to simulate the owner.
    """
    user = setup_data["user"]
    with override_authenticated_user(test_app, user):
        yield api_client_light


@pytest.fixture
async def other_user_client(
    api_client_light: AsyncClient, setup_data: dict[str, Any], test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide an authenticated client for a different signed-in user.

    The fixture overrides authentication dependencies to simulate a non-owner.
    """
    user = setup_data["other_user"]
    with override_authenticated_user(test_app, user):
        yield api_client_light


@pytest.fixture
async def superuser_client_light(
    api_client_light: AsyncClient, db_superuser: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide a lightweight authenticated client for a superuser."""
    with override_authenticated_user(test_app, db_superuser, superuser=True):
        yield api_client_light


class TestPrivacyRedaction:
    """Tests for profile visibility and username redaction."""

    async def test_public_profile_visibility(self, api_client: AsyncClient, setup_data: dict[str, Any]) -> None:
        """Public profiles are visible to everyone."""
        username = setup_data["user"].username
        response = await api_client.get(f"/users/{username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_community_profile_visibility_guest(
        self, db_session: AsyncSession, api_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Community profiles are hidden from guests."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "community")

        response = await api_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_community_profile_visibility_logged_in(
        self, db_session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Community profiles are visible to logged-in users."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "community")

        response = await owner_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_private_profile_visibility_guest(
        self, db_session: AsyncSession, api_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Private profiles are hidden from everyone (except self/admin)."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "private")

        response = await api_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_private_profile_visibility_owner_preserves_owner_identity(
        self, db_session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Owners can still view private profiles and retain visible ownership on list routes."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "private")

        profile_response = await owner_client.get(f"/users/{user.username}/profile")
        assert profile_response.status_code == status.HTTP_200_OK

        products_response = await owner_client.get("/products")
        assert products_response.status_code == status.HTTP_200_OK
        data = products_response.json()
        product_item = next((p for p in data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] == user.username

    async def test_private_profile_visibility_superuser_preserves_detail_identity(
        self, db_session: AsyncSession, superuser_client_light: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Superusers can view private profiles and private owner names on product detail."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "private")

        profile_response = await superuser_client_light.get(f"/users/{user.username}/profile")
        assert profile_response.status_code == status.HTTP_200_OK

        detail_response = await superuser_client_light.get(f"/products/{setup_data['product'].id}")
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.json()["owner_username"] == user.username

    async def test_private_profile_redacts_identity_for_regular_users_across_product_routes(
        self, db_session: AsyncSession, other_user_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Regular users should not see private owner usernames on list or detail routes."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "private")

        products_response = await other_user_client.get("/products")
        assert products_response.status_code == status.HTTP_200_OK
        list_data = products_response.json()
        product_item = next((p for p in list_data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] is None

        detail_response = await other_user_client.get(f"/products/{setup_data['product'].id}")
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.json()["owner_username"] is None

    async def test_identity_redaction_on_user_products(
        self, db_session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """The user-scoped products route should also preserve owner identity for the owner."""
        user = setup_data["user"]
        await set_profile_visibility(db_session, user, "private")

        response = await owner_client.get(f"/users/{user.id}/products")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        product_item = next((p for p in data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] == user.username
