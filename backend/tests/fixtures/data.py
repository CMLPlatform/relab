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
    taxonomy = Taxonomy(
        name="Test Materials Taxonomy",
        version="v1.0.0",
        description="A test taxonomy for materials",
        domains={TaxonomyDomain.MATERIALS},
        source="https://test.example.com",
    )
    session.add(taxonomy)
    await session.flush()
    await session.refresh(taxonomy)
    return taxonomy


@pytest.fixture
async def db_category(session: AsyncSession, db_taxonomy: Taxonomy) -> Category:
    """Create and return a test category in database."""
    category = Category(
        name="Test Category",
        description="A test category",
        taxonomy_id=db_taxonomy.id,
    )
    session.add(category)
    await session.flush()
    await session.refresh(category)
    return category


@pytest.fixture
async def db_material(session: AsyncSession) -> Material:
    """Create and return a test material in database."""
    material = Material(
        name="Test Material",
        description="A test material",
        density_kg_m3=7850.0,
        is_crm=True,
    )
    session.add(material)
    await session.flush()
    await session.refresh(material)
    return material


@pytest.fixture
async def db_product_type(session: AsyncSession) -> ProductType:
    """Create and return a test product type in database."""
    product_type = ProductType(
        name="Test Product Type",
        description="A test product type",
    )
    session.add(product_type)
    await session.flush()
    await session.refresh(product_type)
    return product_type


# Factory fixtures for convenient access
@pytest.fixture
def taxonomy_factory() -> type[TaxonomyFactory]:
    """Provide TaxonomyFactory."""
    return TaxonomyFactory


@pytest.fixture
def category_factory() -> type[CategoryFactory]:
    """Provide CategoryFactory."""
    return CategoryFactory


@pytest.fixture
def material_factory() -> type[MaterialFactory]:
    """Provide MaterialFactory."""
    return MaterialFactory


@pytest.fixture
def product_type_factory() -> type[ProductTypeFactory]:
    """Provide ProductTypeFactory."""
    return ProductTypeFactory
