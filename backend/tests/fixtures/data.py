"""Data fixtures for pre-populating test database."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from tests.constants import BRAND_X, COMPONENT_NAME, PRODUCT_BASE_NAME
from tests.factories.models import (
    CategoryFactory,
    MaterialFactory,
    ProductTypeFactory,
    TaxonomyFactory,
)

if TYPE_CHECKING:
    from app.api.auth.models import User


@dataclass(slots=True)
class ProductGraph:
    """Compact seeded product graph for API tests."""

    product_type: ProductType
    product: Product
    component: Product


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
    product_type = ProductType(
        name="Power Tool",
        description="Handheld electric tools for construction and DIY",
    )
    product = Product(
        owner_id=db_superuser.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        product_type=product_type,
    )
    db_session.add_all([product_type, product])
    await db_session.flush()
    return product


@pytest.fixture
async def setup_product_graph(db_session: AsyncSession, db_superuser: User) -> ProductGraph:
    """Create a compact product graph with a root product and one child component."""
    product_type = ProductType(
        name="Power Tool",
        description="Handheld electric tools for construction and DIY",
    )
    product = Product(
        owner_id=db_superuser.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        product_type=product_type,
    )
    component = Product(
        owner_id=db_superuser.id,
        name=COMPONENT_NAME,
        product_type=product_type,
        parent=product,
        amount_in_parent=1,
    )
    db_session.add_all([product_type, product, component])
    await db_session.flush()
    return ProductGraph(product_type=product_type, product=product, component=component)


@pytest.fixture
async def setup_component(setup_product_graph: ProductGraph) -> Product:
    """Create a child component below ``setup_product``."""
    return setup_product_graph.component
