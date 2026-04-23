"""Focused integration checks for database-backed relationship behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute

from app.api.background_data.models import Taxonomy
from tests.factories.models import CategoryFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.db


async def test_taxonomy_categories_relationship_loads_children(
    db_session: AsyncSession,
    db_taxonomy: Taxonomy,
) -> None:
    """A taxonomy should load all persisted child categories via ORM relationships."""
    await CategoryFactory.create_async(db_session, name="Cat A", taxonomy_id=db_taxonomy.id)
    await CategoryFactory.create_async(db_session, name="Cat B", taxonomy_id=db_taxonomy.id)

    stmt = (
        select(Taxonomy)
        .where(Taxonomy.id == db_taxonomy.id)
        .options(selectinload(cast("QueryableAttribute[Any]", Taxonomy.categories)))
    )
    result = await db_session.execute(stmt)
    taxonomy = result.scalar_one()

    assert {category.name for category in taxonomy.categories} >= {"Cat A", "Cat B"}
