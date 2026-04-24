"""Integration tests for background-data persistence and relationships."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.background_data.models import Category, Taxonomy
from app.api.common.sa_typing import orm_attr
from tests.factories.models import (
    CategoryFactory,
    CategoryMaterialLinkFactory,
    CategoryProductTypeLinkFactory,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.background_data.models import Material, ProductType


pytestmark = pytest.mark.db


async def test_deleting_taxonomy_cascades_categories(db_session: AsyncSession, db_taxonomy: Taxonomy) -> None:
    """Deleting a taxonomy should remove its categories."""
    category = await CategoryFactory.create_async(db_session, name="Test Category", taxonomy_id=db_taxonomy.id)
    category_id = category.id

    await db_session.delete(db_taxonomy)
    await db_session.flush()

    assert await db_session.get(Category, category_id) is None


async def test_category_requires_taxonomy(db_session: AsyncSession) -> None:
    """Categories should fail without a taxonomy foreign key."""
    category = CategoryFactory.build(name="Invalid Category")
    db_session.add(category)

    with pytest.raises(IntegrityError, match="taxonomy_id"):
        await db_session.flush()


async def test_category_hierarchy_loads_subcategories(db_session: AsyncSession, db_taxonomy: Taxonomy) -> None:
    """Category trees should retain parent-child relationships."""
    parent = await CategoryFactory.create_async(db_session, name="Metals", taxonomy_id=db_taxonomy.id)
    await CategoryFactory.create_async(
        db_session,
        name="Ferrous",
        taxonomy_id=db_taxonomy.id,
        supercategory_id=parent.id,
    )
    await db_session.refresh(parent)

    assert parent.subcategories is not None
    assert [subcategory.name for subcategory in parent.subcategories] == ["Ferrous"]


async def test_material_and_product_type_links_round_trip(
    db_session: AsyncSession,
    db_category: Category,
    db_material: Material,
    db_product_type: ProductType,
) -> None:
    """Many-to-many links for categories should remain queryable from both sides."""
    await CategoryMaterialLinkFactory.create_async(
        db_session,
        category_id=db_category.id,
        material_id=db_material.id,
    )
    await CategoryProductTypeLinkFactory.create_async(
        db_session,
        category_id=db_category.id,
        product_type_id=db_product_type.id,
    )

    stmt = (
        select(Category)
        .where(Category.id == db_category.id)
        .options(
            selectinload(orm_attr(Category.materials)),
            selectinload(orm_attr(Category.product_types)),
        )
    )
    result = await db_session.execute(stmt)
    category = result.scalar_one()

    assert category.materials is not None
    assert category.product_types is not None
    assert [material.id for material in category.materials] == [db_material.id]
    assert [product_type.id for product_type in category.product_types] == [db_product_type.id]
