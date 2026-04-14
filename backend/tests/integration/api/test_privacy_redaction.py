"""Integration tests for the 3-tier privacy system."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from fastapi import FastAPI, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import (
    current_active_user,
    current_active_verified_user,
    optional_current_active_user,
)
from app.api.auth.models import User
from tests.factories.models import ProductFactory, ProductTypeFactory, UserFactory

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient


@pytest.fixture
async def setup_data(session: AsyncSession, superuser: User) -> dict[str, Any]:
    """Set up test products and users.

    Returns a dict with keys: `user`, `other_user`, `superuser`, `product`.
    """
    pt = await ProductTypeFactory.create_async(session=session)
    # Using explicit usernames to avoid collisions and ensure searchability
    user = await UserFactory.create_async(session=session, is_active=True, username="privacy_test_user")

    # Force flush to ensure user exists in DB for the API client
    await session.commit()
    await session.begin()

    # Product owned by a "regular" user
    product = await ProductFactory.create_async(
        session=session, owner_id=user.id, product_type_id=pt.id, name="User Product"
    )
    await session.commit()
    await session.begin()

    # Add another user for "Community" testing
    other_user = await UserFactory.create_async(session=session, is_active=True, username="other_user")
    await session.commit()
    await session.begin()

    return {"user": user, "other_user": other_user, "superuser": superuser, "product": product}


async def set_profile_visibility(session: AsyncSession, user: User, visibility: str) -> None:
    """Persist a profile visibility setting for a user."""
    user.preferences = {"profile_visibility": visibility}
    await session.commit()
    await session.begin()


@pytest.fixture
async def owner_client(
    async_client: AsyncClient, setup_data: dict[str, Any], test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide an authenticated client for the private-profile owner.

    The fixture overrides authentication dependencies to simulate the owner.
    """
    user = setup_data["user"]
    test_app.dependency_overrides[current_active_user] = lambda: user
    test_app.dependency_overrides[current_active_verified_user] = lambda: user
    test_app.dependency_overrides[optional_current_active_user] = lambda: user
    yield async_client
    test_app.dependency_overrides.pop(current_active_user, None)
    test_app.dependency_overrides.pop(current_active_verified_user, None)
    test_app.dependency_overrides.pop(optional_current_active_user, None)


@pytest.fixture
async def other_user_client(
    async_client: AsyncClient, setup_data: dict[str, Any], test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide an authenticated client for a different signed-in user.

    The fixture overrides authentication dependencies to simulate a non-owner.
    """
    user = setup_data["other_user"]
    test_app.dependency_overrides[current_active_user] = lambda: user
    test_app.dependency_overrides[current_active_verified_user] = lambda: user
    test_app.dependency_overrides[optional_current_active_user] = lambda: user
    yield async_client
    test_app.dependency_overrides.pop(current_active_user, None)
    test_app.dependency_overrides.pop(current_active_verified_user, None)
    test_app.dependency_overrides.pop(optional_current_active_user, None)


class TestPrivacyRedaction:
    """Tests for profile visibility and username redaction."""

    async def test_public_profile_visibility(self, async_client: AsyncClient, setup_data: dict[str, Any]) -> None:
        """Public profiles are visible to everyone."""
        username = setup_data["user"].username
        response = await async_client.get(f"/users/{username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_community_profile_visibility_guest(
        self, session: AsyncSession, async_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Community profiles are hidden from guests."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "community")

        response = await async_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_community_profile_visibility_logged_in(
        self, session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Community profiles are visible to logged-in users."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "community")

        response = await owner_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_private_profile_visibility_guest(
        self, session: AsyncSession, async_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Private profiles are hidden from everyone (except self/admin)."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await async_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_private_profile_visibility_owner(
        self, session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Owners can still view their own private profiles."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await owner_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_private_profile_visibility_superuser(
        self, session: AsyncSession, superuser_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Superusers can still view private profiles."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await superuser_client.get(f"/users/{user.username}/profile")
        assert response.status_code == status.HTTP_200_OK

    async def test_identity_redaction_private_regular_user(
        self, session: AsyncSession, other_user_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Regular users do not see private owner usernames."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await other_user_client.get("/products")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        product_item = next((p for p in data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] is None

    async def test_identity_redaction_private_owner(
        self, session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Owners can still see their own product ownership."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await owner_client.get("/products")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        product_item = next((p for p in data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] == user.username

    async def test_identity_redaction_on_user_products(
        self, session: AsyncSession, owner_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """The user-scoped products route should also preserve owner identity for the owner."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await owner_client.get(f"/users/{user.id}/products")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        product_item = next((p for p in data["items"] if p["id"] == setup_data["product"].id), None)
        assert product_item is not None
        assert product_item["owner_username"] == user.username

    async def test_identity_redaction_on_product_detail_private_viewer(
        self, session: AsyncSession, other_user_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """A signed-in non-owner should still get a redacted owner on product detail."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await other_user_client.get(f"/products/{setup_data['product'].id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["owner_username"] is None

    async def test_identity_redaction_on_product_detail(
        self, session: AsyncSession, superuser_client: AsyncClient, setup_data: dict[str, Any]
    ) -> None:
        """Superusers can still see private owner usernames on detail responses."""
        user = setup_data["user"]
        await set_profile_visibility(session, user, "private")

        response = await superuser_client.get(f"/products/{setup_data['product'].id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["owner_username"] == user.username
