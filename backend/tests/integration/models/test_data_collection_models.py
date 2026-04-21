"""Integration tests for product persistence, hierarchy, and ownership behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError

from app.api.data_collection.models.product import Product
from tests.factories.models import MaterialFactory, ProductFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


async def test_product_requires_owner(db_session: AsyncSession) -> None:
    """Products without an owner should fail the database constraint."""
    with pytest.raises(IntegrityError):
        await db_session.execute(insert(Product).values(name="Orphan Product", owner_id=None))


async def test_product_hierarchy_links_parent_and_child(db_session: AsyncSession, db_superuser: User) -> None:
    """Parent and child products should preserve the hierarchy fields."""
    parent = await ProductFactory.create_async(
        db_session,
        owner_id=db_superuser.id,
        name="Parent Product",
        parent_id=None,
        product_type_id=None,
    )
    child = await ProductFactory.create_async(
        db_session,
        owner_id=db_superuser.id,
        name="Component",
        parent_id=parent.id,
        amount_in_parent=2,
        product_type_id=None,
    )
    await db_session.refresh(child)

    assert child.parent_id == parent.id
    assert child.amount_in_parent == 2
    assert child.is_base_product is False
    assert child.parent is not None


async def test_product_bom_and_owner_relationships_are_accessible(db_session: AsyncSession, db_superuser: User) -> None:
    """Owner and BOM relationships should remain available after persistence."""
    await MaterialFactory.create_async(db_session, name="Steel")
    product = await ProductFactory.create_async(
        db_session,
        owner_id=db_superuser.id,
        name="Owned Product",
        bill_of_materials=[],
        product_type_id=None,
    )
    await db_session.refresh(product)

    assert product.owner is not None
    assert product.owner.id == db_superuser.id
    assert product.bill_of_materials == []
