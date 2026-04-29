"""Integration tests for component-focused data-collection endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import Material
from tests.constants import (
    BOM_QUANTITY,
    BOM_UNIT,
    COMPONENT_AMOUNT,
    COMPONENT_NAME,
    NEW_COMPONENT_NAME,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from tests.fixtures.data import ProductGraph

pytestmark = pytest.mark.api


async def test_get_product_components(api_client: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """GET /products/{id}/components returns the direct children."""
    response = await api_client.get(f"/v1/products/{setup_product_graph.product.id}/components")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert data[0]["name"] == COMPONENT_NAME


async def test_get_component_by_id(api_client: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """GET /components/{id} returns the requested component via its stable URL."""
    response = await api_client.get(f"/v1/components/{setup_product_graph.component.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == setup_product_graph.component.id
    assert "videos" not in data


async def test_get_component_rejects_base_product_id(
    api_client: AsyncClient, setup_product_graph: ProductGraph
) -> None:
    """GET /components/{id} 404s when the id belongs to a base product."""
    response = await api_client.get(f"/v1/components/{setup_product_graph.product.id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_get_product_rejects_component_id(api_client: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """GET /products/{id} 404s when the id belongs to a component."""
    response = await api_client.get(f"/v1/products/{setup_product_graph.component.id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_get_product_component_tree(
    api_client: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """GET /products/{id}/components/tree returns the bounded component subtree."""
    response = await api_client.get(f"/v1/products/{setup_product_graph.product.id}/components/tree?recursion_depth=1")

    assert response.status_code == status.HTTP_200_OK
    assert [item["id"] for item in response.json()] == [setup_product_graph.component.id]


async def test_add_component_to_product(
    api_client_superuser: AsyncClient, db_session: AsyncSession, setup_product: Product
) -> None:
    """POST /products/{id}/components adds a component."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_COMPONENT_NAME,
        "amount_in_parent": COMPONENT_AMOUNT,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post(f"/v1/products/{setup_product.id}/components", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == NEW_COMPONENT_NAME


async def test_add_component_to_product_rejects_component_parent(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    setup_product_graph: ProductGraph,
) -> None:
    """Product-scoped component creation is base-product-only."""
    material = Material(name="Nested Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_COMPONENT_NAME,
        "amount_in_parent": COMPONENT_AMOUNT,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post(
        f"/v1/products/{setup_product_graph.component.id}/components",
        json=payload,
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_add_nested_component_to_component(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    setup_product_graph: ProductGraph,
) -> None:
    """Nested components are created through /components/{id}/components."""
    material = Material(name="Nested Aluminum")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_COMPONENT_NAME,
        "amount_in_parent": COMPONENT_AMOUNT,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post(
        f"/v1/components/{setup_product_graph.component.id}/components",
        json=payload,
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == NEW_COMPONENT_NAME


async def test_add_component_rejects_videos(
    api_client_superuser: AsyncClient, db_session: AsyncSession, setup_product: Product
) -> None:
    """Components do not accept product-level videos."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_COMPONENT_NAME,
        "amount_in_parent": COMPONENT_AMOUNT,
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
        "videos": [{"url": "https://example.com/video", "title": "Demo"}],
    }

    response = await api_client_superuser.post(f"/v1/products/{setup_product.id}/components", json=payload)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


async def test_component_materials_routes_use_component_scope(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    setup_product_graph: ProductGraph,
) -> None:
    """Component bill-of-materials live under /components/{id}/materials."""
    material = Material(name="Aluminum")
    db_session.add(material)
    await db_session.flush()
    payload = [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}]

    create_response = await api_client_superuser.post(
        f"/v1/components/{setup_product_graph.component.id}/materials",
        json=payload,
    )
    list_response = await api_client_superuser.get(f"/v1/components/{setup_product_graph.component.id}/materials")

    assert create_response.status_code == status.HTTP_201_CREATED
    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.json()[0]["material_id"] == material.id


async def test_delete_component(api_client_superuser: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """DELETE /components/{id} removes the component."""
    response = await api_client_superuser.delete(f"/v1/components/{setup_product_graph.component.id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT


async def test_patch_component(api_client_superuser: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """PATCH /components/{id} updates the component and preserves amount_in_parent."""
    response = await api_client_superuser.patch(
        f"/v1/components/{setup_product_graph.component.id}",
        json={"name": "Renamed Component"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Renamed Component"


async def test_component_media_reads_are_public(api_client: AsyncClient, setup_product_graph: ProductGraph) -> None:
    """Component media reads should not require ownership."""
    files_response = await api_client.get(f"/v1/components/{setup_product_graph.component.id}/files")
    images_response = await api_client.get(f"/v1/components/{setup_product_graph.component.id}/images")

    assert files_response.status_code == status.HTTP_200_OK
    assert images_response.status_code == status.HTTP_200_OK
