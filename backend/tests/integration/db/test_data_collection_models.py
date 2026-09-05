"""Integration tests for product persistence, hierarchy, and ownership behavior."""

from typing import TYPE_CHECKING

import pytest
from sqlalchemy import insert
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.api.data_collection.crud.product_tree_queries import require_product_detail
from app.api.data_collection.models.product import Product
from tests.factories.models import ProductFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.db


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


async def test_product_detail_load_stops_below_the_first_component_level(
    db_session: AsyncSession, db_superuser: User
) -> None:
    """A detail read loads one level of components and nothing under it.

    Components render as the flat ComponentRead, so anything below that level
    would be fetched and thrown away. Product's relationships are eager at class
    level, so what keeps the read bounded is the raiseload("*") that
    apply_loader_profile puts on the statement — it propagates to sub-loaders.
    This pins that behaviour: drop the wildcard and a detail read starts walking
    the subtree again.
    """
    parent = await ProductFactory.create_async(
        db_session, owner_id=db_superuser.id, name="Detail Parent", parent_id=None, product_type_id=None
    )
    component = await ProductFactory.create_async(
        db_session,
        owner_id=db_superuser.id,
        name="Detail Component",
        parent_id=parent.id,
        amount_in_parent=1,
        product_type_id=None,
    )
    await ProductFactory.create_async(
        db_session,
        owner_id=db_superuser.id,
        name="Detail Grandchild",
        parent_id=component.id,
        amount_in_parent=1,
        product_type_id=None,
    )
    db_session.expunge_all()

    loaded = await require_product_detail(db_session, parent.id)

    assert [child.name for child in loaded.components or []] == ["Detail Component"]
    child = (loaded.components or [])[0]
    assert child.owner is not None, "ComponentRead.owner_username needs the owner loaded"
    unloaded = sa_inspect(child).unloaded
    assert "components" in unloaded, "the grandchild level was loaded but never rendered"
    assert "images" in unloaded
