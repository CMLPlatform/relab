"""Representative authorization matrix tests for API route classes.

Inspired by the OWASP ASVS Authorization Testing Automation guidelines.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, HTTPException, status

from app.api.auth.dependencies import current_active_superuser, current_active_verified_user
from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType
from tests.constants import UPDATED_PRODUCT_NAME
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.api


@pytest.fixture
async def regular_user_product(db_session: AsyncSession, db_user: User) -> Product:
    """Create a base product owned by the regular authenticated user."""
    product_type = ProductType(name="Authorization Matrix Type")
    product = Product(
        owner_id=db_user.id,
        name="Regular User Product",
        product_type=product_type,
    )
    db_session.add_all([product_type, product])
    await db_session.flush()
    return product


@pytest.fixture
async def db_unverified_user(db_session: AsyncSession) -> User:
    """Create an active user whose email is not verified."""
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=False,
        is_active=True,
        is_verified=False,
        refresh_instance=True,
    )


def assert_status(response_status: int, expected_status: int, case_name: str) -> None:
    """Assert one authorization matrix decision with a readable failure label."""
    assert response_status == expected_status, f"{case_name}: expected {expected_status}, got {response_status}"


async def test_authorization_matrix_for_representative_route_classes(
    api_client: AsyncClient,
    test_app: FastAPI,
    db_user: User,
    db_unverified_user: User,
    db_superuser: User,
    setup_product: Product,
    regular_user_product: Product,
) -> None:
    """Route classes enforce the expected anonymous, regular, owner, foreign, and admin decisions."""
    taxonomy_payload = {
        "name": "Authorization Matrix Taxonomy",
        "version": "v1",
        "domains": ["materials"],
    }

    anonymous_read = await api_client.get(f"/v1/products/{setup_product.id}")
    assert_status(anonymous_read.status_code, status.HTTP_200_OK, "anonymous public product read")

    anonymous_mutation = await api_client.patch(
        f"/v1/products/{setup_product.id}",
        json={"name": UPDATED_PRODUCT_NAME},
    )
    assert_status(anonymous_mutation.status_code, status.HTTP_401_UNAUTHORIZED, "anonymous product mutation")

    def raise_forbidden() -> None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    with override_authenticated_user(test_app, db_unverified_user, verified=False, optional=False):
        test_app.dependency_overrides[current_active_verified_user] = raise_forbidden
        try:
            unverified_mutation = await api_client.patch(
                f"/v1/products/{setup_product.id}",
                json={"name": UPDATED_PRODUCT_NAME},
            )
            assert_status(
                unverified_mutation.status_code,
                status.HTTP_403_FORBIDDEN,
                "unverified user verified-only mutation",
            )
        finally:
            test_app.dependency_overrides.pop(current_active_verified_user, None)

    with override_authenticated_user(test_app, db_user, optional=False):
        own_mutation = await api_client.patch(
            f"/v1/products/{regular_user_product.id}",
            json={"name": UPDATED_PRODUCT_NAME},
        )
        assert_status(own_mutation.status_code, status.HTTP_200_OK, "regular user own-object mutation")

        foreign_mutation = await api_client.patch(
            f"/v1/products/{setup_product.id}",
            json={"name": UPDATED_PRODUCT_NAME},
        )
        assert_status(foreign_mutation.status_code, status.HTTP_404_NOT_FOUND, "regular user foreign-object mutation")

        test_app.dependency_overrides[current_active_superuser] = raise_forbidden
        try:
            regular_admin = await api_client.post("/v1/admin/taxonomies", json=taxonomy_payload)
            assert_status(regular_admin.status_code, status.HTTP_403_FORBIDDEN, "regular user admin route")
        finally:
            test_app.dependency_overrides.pop(current_active_superuser, None)

    with override_authenticated_user(test_app, db_superuser, superuser=True):
        superuser_admin = await api_client.post(
            "/v1/admin/taxonomies",
            json={**taxonomy_payload, "name": "Authorization Matrix Superuser Taxonomy"},
        )
        assert_status(superuser_admin.status_code, status.HTTP_201_CREATED, "superuser admin route")
