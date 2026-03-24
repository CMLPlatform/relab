"""Data fixtures for pre-populating test database."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from tests.factories.models import (
    CategoryFactory,
    MaterialFactory,
    ProductTypeFactory,
    TaxonomyFactory,
)


@pytest.fixture
async def db_taxonomy(session: AsyncSession) -> Taxonomy:
    """Create and return a test taxonomy in database."""
    return await TaxonomyFactory.create_async(
        session,
        name="Test Materials Taxonomy",
        version="v1.0.0",
        description="A test taxonomy for materials",
        domains={TaxonomyDomain.MATERIALS},
        source="https://test.example.com",
    )


@pytest.fixture
async def db_category(session: AsyncSession, db_taxonomy: Taxonomy) -> Category:
    """Create and return a test category in database."""
    return await CategoryFactory.create_async(
        session,
        name="Test Category",
        description="A test category",
        taxonomy_id=db_taxonomy.id,
    )


@pytest.fixture
async def db_material(session: AsyncSession) -> Material:
    """Create and return a test material in database."""
    return await MaterialFactory.create_async(
        session,
        name="Test Material",
        description="A test material",
        density_kg_m3=7850.0,
        is_crm=True,
    )


@pytest.fixture
async def db_product_type(session: AsyncSession) -> ProductType:
    """Create and return a test product type in database."""
    return await ProductTypeFactory.create_async(
        session,
        name="Test Product Type",
        description="A test product type",
    )
