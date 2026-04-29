"""Integration tests for brand listing endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType
from tests.constants import (
    BRAND_X,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.api


async def seed_brands(
    db_session: AsyncSession,
    owner_id: object,
    *brands: str | None,
) -> None:
    """Create multiple products sharing one product type with a single flush."""
    product_type = ProductType(name="Power Tool", description="Handheld electric tools for construction and DIY")
    products = [
        Product(
            owner_id=owner_id,
            product_type=product_type,
            brand=brand,
            name=f"Brand Product {index}",
        )
        for index, brand in enumerate(brands, start=1)
    ]
    db_session.add_all([product_type, *products])
    await db_session.flush()


async def test_get_brand_suggestions(api_client_light: AsyncClient, setup_product: Product) -> None:
    """GET /v1/products/suggestions/brands returns unique brands derived from products."""
    del setup_product
    response = await api_client_light.get("/v1/products/suggestions/brands")

    assert response.status_code == status.HTTP_200_OK
    assert BRAND_X in response.json()["items"]


async def test_returns_empty_when_no_products(api_client_light: AsyncClient) -> None:
    """GET /v1/products/suggestions/brands returns an empty page when no products exist."""
    response = await api_client_light.get("/v1/products/suggestions/brands")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []


async def test_returns_brands(api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /v1/products/suggestions/brands title-cases product brands."""
    await seed_brands(db_session, db_superuser.id, "apple")

    response = await api_client_light.get("/v1/products/suggestions/brands")

    assert response.status_code == status.HTTP_200_OK
    assert "Apple" in response.json()["items"]


async def test_deduplicates_brands(api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /v1/products/suggestions/brands collapses case-insensitive duplicates."""
    await seed_brands(db_session, db_superuser.id, "dell", "DELL")

    response = await api_client_light.get("/v1/products/suggestions/brands")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"].count("Dell") == 1


async def test_excludes_null_brands(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """GET /v1/products/suggestions/brands excludes products without a brand."""
    await seed_brands(db_session, db_superuser.id, None)

    response = await api_client_light.get("/v1/products/suggestions/brands")

    assert response.status_code == status.HTTP_200_OK
    assert None not in response.json()["items"]


async def test_search_filters_brands(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """GET /v1/products/suggestions/brands supports search filtering."""
    await seed_brands(db_session, db_superuser.id, "apple", "samsung")

    response = await api_client_light.get("/v1/products/suggestions/brands", params={"search": "apple"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert "Apple" in brands
    assert "Samsung" not in brands


async def test_order_asc(api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /v1/products/suggestions/brands returns ascending order by default."""
    await seed_brands(db_session, db_superuser.id, "zebra", "apple")

    response = await api_client_light.get("/v1/products/suggestions/brands", params={"order": "asc"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert brands.index("Apple") < brands.index("Zebra")


async def test_order_desc(api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /v1/products/suggestions/brands returns descending order when requested."""
    await seed_brands(db_session, db_superuser.id, "zebra", "apple")

    response = await api_client_light.get("/v1/products/suggestions/brands", params={"order": "desc"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert brands.index("Zebra") < brands.index("Apple")


async def test_product_facets_return_counts(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """GET /v1/products/facets returns derived filter values with counts."""
    await seed_brands(db_session, db_superuser.id, "apple", "apple", "dell")

    response = await api_client_light.get("/v1/products/facets", params={"fields": "brand"})

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "brand": [
            {"value": "Apple", "count": 2},
            {"value": "Dell", "count": 1},
        ]
    }
