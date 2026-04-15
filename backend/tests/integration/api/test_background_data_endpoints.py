"""Integration tests for background-data HTTP contracts."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from dirty_equals import IsInt, IsPositive, IsStr
from fastapi import status

from app.api.background_data.models import TaxonomyDomain
from tests.factories.models import CategoryFactory, TaxonomyFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.background_data.models import Category, Taxonomy

TAXONOMY_NAME = "Test API Taxonomy"
TAXONOMY_VERSION = "v1.0.0"
TAXONOMY_DESC = "Created via API"
PARENT_CATEGORY = "Parent Category"
CHILD_CATEGORY = "Child Category"
NONEXISTENT_ID = "99999"

pytestmark = [pytest.mark.integration, pytest.mark.api]


async def test_create_taxonomy_contract(api_client_superuser: AsyncClient) -> None:
    """Admin taxonomy creation should return the created resource contract."""
    response = await api_client_superuser.post(
        "/admin/taxonomies",
        json={
            "name": TAXONOMY_NAME,
            "version": TAXONOMY_VERSION,
            "description": TAXONOMY_DESC,
            "domains": ["materials"],
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == TAXONOMY_NAME


async def test_get_taxonomy_returns_expected_shape(api_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
    """Public taxonomy reads should expose the stable response contract."""
    response = await api_client.get(f"/taxonomies/{db_taxonomy.id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "id": IsInt & IsPositive,
        "name": IsStr,
        "version": IsStr | None,
        "description": IsStr | None,
        "domains": ["materials"],
        "source": IsStr | None,
        "created_at": IsStr,
        "updated_at": IsStr,
    }


async def test_unknown_taxonomy_returns_404(api_client: AsyncClient) -> None:
    """Missing taxonomies should return 404."""
    response = await api_client.get(f"/taxonomies/{NONEXISTENT_ID}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_list_taxonomies_returns_paginated_items(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Listing taxonomies should return paginated data once rows exist."""
    for index in range(2):
        await TaxonomyFactory.create_async(
            db_session,
            name=f"Taxonomy {index}",
            version=f"v{index}.0.0",
            domains={TaxonomyDomain.MATERIALS},
        )

    response = await api_client.get("/taxonomies")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()["items"]) >= 2


async def test_taxonomy_category_endpoints_return_flat_and_tree_views(
    api_client: AsyncClient,
    db_session: AsyncSession,
    db_taxonomy: Taxonomy,
) -> None:
    """Taxonomy category endpoints should expose both flat and nested read shapes."""
    parent = await CategoryFactory.create_async(db_session, taxonomy_id=db_taxonomy.id, name=PARENT_CATEGORY)
    await CategoryFactory.create_async(
        db_session,
        taxonomy_id=db_taxonomy.id,
        supercategory_id=parent.id,
        name=CHILD_CATEGORY,
    )

    flat_response = await api_client.get(f"/taxonomies/{db_taxonomy.id}/categories")
    tree_response = await api_client.get(f"/taxonomies/{db_taxonomy.id}/categories/tree?recursion_depth=2")

    assert flat_response.status_code == status.HTTP_200_OK
    assert {item["name"] for item in flat_response.json()["items"]} >= {PARENT_CATEGORY, CHILD_CATEGORY}
    assert tree_response.status_code == status.HTTP_200_OK
    assert tree_response.json()["items"][0]["name"] == PARENT_CATEGORY


async def test_category_reads_support_conditional_get(api_client: AsyncClient, db_category: Category) -> None:
    """Category detail responses should return 304 when the ETag matches."""
    first_response = await api_client.get(f"/categories/{db_category.id}")
    second_response = await api_client.get(
        f"/categories/{db_category.id}",
        headers={"If-None-Match": first_response.headers["etag"]},
    )

    assert first_response.status_code == status.HTTP_200_OK
    assert second_response.status_code == status.HTTP_304_NOT_MODIFIED


async def test_admin_category_creation_supports_nested_subcategories(
    api_client_superuser: AsyncClient,
    db_taxonomy: Taxonomy,
) -> None:
    """Admin category creation should accept nested subcategory payloads."""
    response = await api_client_superuser.post(
        "/admin/categories",
        json={
            "name": PARENT_CATEGORY,
            "taxonomy_id": db_taxonomy.id,
            "subcategories": [{"name": CHILD_CATEGORY}],
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == PARENT_CATEGORY


async def test_material_validation_rejects_negative_density(api_client_superuser: AsyncClient) -> None:
    """Materials with negative density should fail schema validation."""
    response = await api_client_superuser.post(
        "/admin/materials",
        json={"name": "Bad Material", "density_kg_m3": -100.0},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


async def test_product_type_creation_returns_created_resource(api_client_superuser: AsyncClient) -> None:
    """Admin product-type creation should return the created item."""
    response = await api_client_superuser.post(
        "/admin/product-types",
        json={"name": "Test API Product Type", "description": "Created via API"},
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == "Test API Product Type"


async def test_units_endpoint_returns_available_units(api_client: AsyncClient) -> None:
    """The units endpoint should return the supported unit values."""
    response = await api_client.get("/units")
    assert response.status_code == status.HTTP_200_OK
    assert "g" in response.json() or "kg" in response.json()
