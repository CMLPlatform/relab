"""Integration tests for component-focused data-collection endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from tests.factories.models import MaterialFactory
from tests.integration.api.data_collection_support import (
    BOM_QUANTITY,
    BOM_UNIT,
    COMPONENT_AMOUNT,
    COMPONENT_NAME,
    NEW_COMPONENT_NAME,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = [pytest.mark.integration, pytest.mark.api]


async def test_get_product_components(
    api_client: AsyncClient, setup_product: Product, setup_component: Product
) -> None:
    """GET /products/{id}/components returns the direct children."""
    del setup_component
    response = await api_client.get(f"/products/{setup_product.id}/components")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert data[0]["name"] == COMPONENT_NAME


async def test_get_product_component_by_id(
    api_client: AsyncClient, setup_product: Product, setup_component: Product
) -> None:
    """GET /products/{pid}/components/{cid} returns the requested component."""
    response = await api_client.get(f"/products/{setup_product.id}/components/{setup_component.id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == setup_component.id


async def test_get_product_component_tree(
    api_client: AsyncClient,
    setup_product: Product,
    setup_component: Product,
) -> None:
    """GET /products/{id}/components/tree returns the bounded component subtree."""
    response = await api_client.get(f"/products/{setup_product.id}/components/tree?recursion_depth=1")

    assert response.status_code == status.HTTP_200_OK
    assert [item["id"] for item in response.json()] == [setup_component.id]


async def test_add_component_to_product(
    api_client_superuser: AsyncClient, db_session: AsyncSession, setup_product: Product
) -> None:
    """POST /products/{id}/components adds a component."""
    material = await MaterialFactory.create_async(session=db_session)
    payload = {
        "name": NEW_COMPONENT_NAME,
        "amount_in_parent": COMPONENT_AMOUNT,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post(f"/products/{setup_product.id}/components", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == NEW_COMPONENT_NAME


async def test_delete_product_component(
    api_client_superuser: AsyncClient, setup_product: Product, setup_component: Product
) -> None:
    """DELETE /products/{pid}/components/{cid} removes the component."""
    response = await api_client_superuser.delete(f"/products/{setup_product.id}/components/{setup_component.id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT
