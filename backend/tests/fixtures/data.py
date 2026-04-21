"""Data fixtures for pre-populating test database."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from app.api.data_collection.models.product import Product
from tests.constants import BRAND_X, COMPONENT_NAME, END_TIME, PRODUCT_BASE_NAME, START_TIME
from tests.factories.models import (
    CategoryFactory,
    MaterialFactory,
    ProductFactory,
    ProductTypeFactory,
    TaxonomyFactory,
)

if TYPE_CHECKING:
    from app.api.auth.models import User


@pytest.fixture
async def db_taxonomy(db_session: AsyncSession) -> Taxonomy:
    """Create and return a test taxonomy in database."""
    return await TaxonomyFactory.create_async(
        db_session,
        name="CEN/TC 411 Materials Taxonomy",
        version="v2.1.0",
        description="European standard material classification for circular economy",
        domains={TaxonomyDomain.MATERIALS},
        source="https://standards.cencenelec.eu",
    )


@pytest.fixture
async def db_category(db_session: AsyncSession, db_taxonomy: Taxonomy) -> Category:
    """Create and return a test category in database."""
    return await CategoryFactory.create_async(
        db_session,
        name="Ferrous Metals",
        description="Iron-based alloys including steel and cast iron",
        taxonomy_id=db_taxonomy.id,
    )


@pytest.fixture
async def db_material(db_session: AsyncSession) -> Material:
    """Create and return a test material in database."""
    return await MaterialFactory.create_async(
        db_session,
        name="Stainless Steel 304",
        description="Austenitic chromium-nickel stainless steel",
        density_kg_m3=7930.0,
        is_crm=True,
    )


@pytest.fixture
async def db_product_type(db_session: AsyncSession) -> ProductType:
    """Create and return a test product type in database."""
    return await ProductTypeFactory.create_async(
        db_session,
        name="Power Tool",
        description="Handheld electric tools for construction and DIY",
    )


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
