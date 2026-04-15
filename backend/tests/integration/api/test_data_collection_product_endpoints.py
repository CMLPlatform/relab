"""Integration tests for product-focused data-collection endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.common.models.enums import Unit
from app.api.data_collection.models.product import MaterialProductLink, Product
from tests.factories.models import MaterialFactory, ProductFactory, ProductTypeFactory
from tests.integration.api.data_collection_support import (
    BOM_QUANTITY,
    BOM_UNIT,
    BRAND_X,
    END_TIME,
    HEIGHT_10,
    NEW_PRODUCT_NAME,
    PRODUCT_BASE_NAME,
    PRODUCT_DESC,
    RECYCLABILITY_GOOD,
    START_TIME,
    UPDATED_PRODUCT_NAME,
    WEIGHT_500,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = [pytest.mark.integration, pytest.mark.api]


async def test_get_products(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /products returns the current product page."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        dismantling_time_start=START_TIME,
        dismantling_time_end=END_TIME,
    )

    response = await api_client.get("/products")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["items"]
    assert data["items"][0]["name"] == PRODUCT_BASE_NAME


async def test_get_products_tree(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/tree returns the product hierarchy."""
    response = await api_client.get("/products/tree?recursion_depth=1")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    if data:
        tree_product = next((item for item in data if item["id"] == setup_product.id), None)
        assert tree_product is not None
        assert tree_product["name"] == PRODUCT_BASE_NAME


async def test_get_product_by_id(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns the requested product."""
    response = await api_client.get(f"/products/{setup_product.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == setup_product.id
    assert data["name"] == PRODUCT_BASE_NAME


async def test_get_product_by_id_supports_conditional_get(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns 304 when the entity tag matches."""
    first_response = await api_client.get(f"/products/{setup_product.id}")
    assert first_response.status_code == status.HTTP_200_OK
    assert "etag" in first_response.headers

    second_response = await api_client.get(
        f"/products/{setup_product.id}",
        headers={"If-None-Match": first_response.headers["etag"]},
    )

    assert second_response.status_code == status.HTTP_304_NOT_MODIFIED


async def test_validate_product_tree(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """POST /products/{id}/validate handles a fully loaded tree."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    root = await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        name=f"{PRODUCT_BASE_NAME} Root",
    )
    child = await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        parent_id=root.id,
        product_type_id=product_type.id,
        name=f"{PRODUCT_BASE_NAME} Child",
    )
    material = await MaterialFactory.create_async(session=db_session)
    db_session.add(
        MaterialProductLink(
            material_id=material.id,
            product_id=child.id,
            quantity=1.0,
            unit=Unit.GRAM,
        )
    )
    await db_session.commit()
    await db_session.begin()

    response = await api_client.post(f"/products/{root.id}/validate")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["valid"] is True


async def test_create_product(api_client_superuser: AsyncClient, db_session: AsyncSession) -> None:
    """POST /products creates a new product."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    material = await MaterialFactory.create_async(session=db_session)
    payload = {
        "name": NEW_PRODUCT_NAME,
        "description": PRODUCT_DESC,
        "product_type_id": product_type.id,
        "weight_g": WEIGHT_500,
        "height_cm": HEIGHT_10,
        "recyclability_observation": RECYCLABILITY_GOOD,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post("/products", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == NEW_PRODUCT_NAME
    assert "id" in data


async def test_update_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} updates a product."""
    response = await api_client_superuser.patch(f"/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == UPDATED_PRODUCT_NAME


async def test_delete_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """DELETE /products/{id} removes the product."""
    response = await api_client_superuser.delete(f"/products/{setup_product.id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT


async def test_user_products_redirect(api_client_superuser: AsyncClient, db_superuser: User) -> None:
    """GET /users/me/products follows the redirect to the user's products."""
    del db_superuser
    response = await api_client_superuser.get("/users/me/products")

    assert response.status_code == status.HTTP_200_OK
