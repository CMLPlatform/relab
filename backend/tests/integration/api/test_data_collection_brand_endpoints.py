"""Integration tests for brand listing endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from tests.factories.models import ProductFactory, ProductTypeFactory
from tests.integration.api.data_collection_support import (
    BRAND_X,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = [pytest.mark.integration, pytest.mark.api]


async def test_get_brands(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /brands returns the unique brands from product data."""
    del setup_product
    response = await api_client.get("/brands")

    assert response.status_code == status.HTTP_200_OK
    assert BRAND_X in response.json()["items"]


async def test_returns_empty_when_no_products(api_client: AsyncClient) -> None:
    """GET /brands returns an empty page when no products exist."""
    response = await api_client.get("/brands")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []


async def test_returns_brands(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands title-cases product brands."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="apple",
    )

    response = await api_client.get("/brands")

    assert response.status_code == status.HTTP_200_OK
    assert "Apple" in response.json()["items"]


async def test_deduplicates_brands(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands collapses case-insensitive duplicates."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="dell",
    )
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="DELL",
    )

    response = await api_client.get("/brands")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"].count("Dell") == 1


async def test_excludes_null_brands(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands excludes products without a brand."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand=None,
    )

    response = await api_client.get("/brands")

    assert response.status_code == status.HTTP_200_OK
    assert None not in response.json()["items"]


async def test_search_filters_brands(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands supports search filtering."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="apple",
    )
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="samsung",
    )

    response = await api_client.get("/brands", params={"search": "apple"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert "Apple" in brands
    assert "Samsung" not in brands


async def test_order_asc(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands returns ascending order by default."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="zebra",
    )
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="apple",
    )

    response = await api_client.get("/brands", params={"order": "asc"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert brands.index("Apple") < brands.index("Zebra")


async def test_order_desc(api_client: AsyncClient, db_session: AsyncSession, db_superuser: User) -> None:
    """GET /brands returns descending order when requested."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="zebra",
    )
    await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        brand="apple",
    )

    response = await api_client.get("/brands", params={"order": "desc"})

    assert response.status_code == status.HTTP_200_OK
    brands = response.json()["items"]
    assert brands.index("Zebra") < brands.index("Apple")
