"""Integration tests for product-focused data-collection endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import Material, ProductType
from tests.constants import (
    BOM_QUANTITY,
    BOM_UNIT,
    BRAND_X,
    HEIGHT_10,
    NEW_PRODUCT_NAME,
    PRODUCT_BASE_NAME,
    PRODUCT_DESC,
    RECYCLABILITY_GOOD,
    UPDATED_PRODUCT_NAME,
    WEIGHT_500,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from tests.fixtures.data import ProductGraph

pytestmark = pytest.mark.api


async def test_get_products(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /products returns the current product page."""
    product_type = ProductType(name="Power Tool", description="Handheld electric tools for construction and DIY")
    product = Product(
        owner_id=db_superuser.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        product_type=product_type,
    )
    db_session.add_all([product_type, product])
    await db_session.flush()

    response = await api_client.get("/v1/products")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["items"]
    assert data["items"][0]["name"] == PRODUCT_BASE_NAME


async def test_get_product_components_tree_includes_nested_components(
    api_client: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """GET /products/{id}/components/tree returns nested components at bounded depth."""
    response = await api_client.get(f"/v1/products/{setup_product_graph.product.id}/components/tree?recursion_depth=2")

    assert response.status_code == status.HTTP_200_OK
    assert [component["id"] for component in response.json()] == [setup_product_graph.component.id]


async def test_get_product_by_id(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns the requested product."""
    response = await api_client.get(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == setup_product.id
    assert data["name"] == PRODUCT_BASE_NAME


async def test_get_product_by_id_supports_conditional_get(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns 304 when the entity tag matches."""
    first_response = await api_client.get(f"/v1/products/{setup_product.id}")
    assert first_response.status_code == status.HTTP_200_OK
    assert "etag" in first_response.headers

    second_response = await api_client.get(
        f"/v1/products/{setup_product.id}",
        headers={"If-None-Match": first_response.headers["etag"]},
    )

    assert second_response.status_code == status.HTTP_304_NOT_MODIFIED


async def test_create_product(api_client_superuser: AsyncClient, db_session: AsyncSession) -> None:
    """POST /products creates a new product."""
    product_type = ProductType(name="Power Tool", description="Handheld electric tools for construction and DIY")
    material = Material(name="Steel")
    db_session.add_all([product_type, material])
    await db_session.flush()
    payload = {
        "name": NEW_PRODUCT_NAME,
        "description": PRODUCT_DESC,
        "product_type_id": product_type.id,
        "weight_g": WEIGHT_500,
        "height_cm": HEIGHT_10,
        "circularity_properties": {"recyclability": RECYCLABILITY_GOOD},
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post("/v1/products", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == NEW_PRODUCT_NAME
    assert data["circularity_properties"]["recyclability"] == RECYCLABILITY_GOOD
    assert "id" in data


async def test_create_product_normalizes_empty_circularity_properties(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST /products returns null for empty circularity JSON."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_PRODUCT_NAME,
        "circularity_properties": {},
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post("/v1/products", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["circularity_properties"] is None


async def test_update_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} updates a product."""
    response = await api_client_superuser.patch(f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == UPDATED_PRODUCT_NAME


async def test_delete_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """DELETE /products/{id} removes the product."""
    response = await api_client_superuser.delete(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT


async def test_non_owner_cannot_update_product(api_client_user: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} hides products owned by another user."""
    response = await api_client_user.patch(f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME})

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_non_owner_cannot_delete_product(api_client_user: AsyncClient, setup_product: Product) -> None:
    """DELETE /products/{id} hides products owned by another user."""
    response = await api_client_user.delete(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_product_media_reads_are_public(api_client: AsyncClient, setup_product: Product) -> None:
    """Base-product media reads should not require ownership."""
    files_response = await api_client.get(f"/v1/products/{setup_product.id}/files")
    images_response = await api_client.get(f"/v1/products/{setup_product.id}/images")

    assert files_response.status_code == status.HTTP_200_OK
    assert images_response.status_code == status.HTTP_200_OK


async def test_current_user_products_filter(api_client_superuser: AsyncClient, db_superuser: User) -> None:
    """GET /v1/products?owner=me returns the authenticated user's products."""
    del db_superuser
    response = await api_client_superuser.get("/v1/products?owner=me")

    assert response.status_code == status.HTTP_200_OK


async def test_product_materials_reject_component_ids(
    api_client_superuser: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """Product material routes are scoped to base products only."""
    response = await api_client_superuser.get(f"/v1/products/{setup_product_graph.component.id}/materials")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_product_videos_reject_component_ids(
    api_client_superuser: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """Product video routes are scoped to base products only."""
    response = await api_client_superuser.get(f"/v1/products/{setup_product_graph.component.id}/videos")

    assert response.status_code == status.HTTP_404_NOT_FOUND
