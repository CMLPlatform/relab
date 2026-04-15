"""Data fixtures for pre-populating test database."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from tests.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory, TaxonomyFactory


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
