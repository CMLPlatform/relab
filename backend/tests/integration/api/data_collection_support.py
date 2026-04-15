"""Shared fixtures and constants for split data-collection API tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from app.api.data_collection.models.product import Product
from tests.factories.models import ProductFactory, ProductTypeFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

PRODUCT_BASE_NAME = "Test Product Base"
BRAND_X = "Brand X"
START_TIME = datetime(2020, 1, 1, tzinfo=UTC)
END_TIME = datetime(2020, 1, 2, tzinfo=UTC)
COMPONENT_NAME = "Test Component"
NEW_PRODUCT_NAME = "New API Product"
PRODUCT_DESC = "Via API"
WEIGHT_500 = 500.0
HEIGHT_10 = 10.0
RECYCLABILITY_GOOD = "Good"
UPDATED_PRODUCT_NAME = "Updated API Product"
NEW_COMPONENT_NAME = "New API Component"
COMPONENT_AMOUNT = 2
BOM_QUANTITY = 10.0
BOM_UNIT = "g"


@pytest.fixture
async def setup_product(db_session: AsyncSession, db_superuser: User) -> Product:
    """Create a top-level product owned by the authenticated superuser."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    return await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        product_type_id=product_type.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        dismantling_time_start=START_TIME,
        dismantling_time_end=END_TIME,
    )


@pytest.fixture
async def setup_component(db_session: AsyncSession, setup_product: Product, db_superuser: User) -> Product:
    """Create a child component below ``setup_product``."""
    product_type = await ProductTypeFactory.create_async(session=db_session)
    return await ProductFactory.create_async(
        session=db_session,
        owner_id=db_superuser.id,
        parent_id=setup_product.id,
        product_type_id=product_type.id,
        name=COMPONENT_NAME,
        dismantling_time_start=START_TIME,
        dismantling_time_end=END_TIME,
    )
