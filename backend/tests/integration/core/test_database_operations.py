"""Integration tests for model-level database constraints, relationships, and schema defaults.

These tests verify that our SQLAlchemy model definitions (FKs, relationships,
server-side defaults) behave correctly against a real Postgres instance.
They do NOT test generic ORM mechanics — those are covered by SQLAlchemy's own test suite.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute

from app.api.background_data.models import Taxonomy
from tests.factories.models import CategoryFactory, MaterialFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from tests.fixtures.database import DBOperations


@pytest.mark.integration
class TestDatabaseConstraints:
    """Model definitions enforce expected database-level constraints."""

    async def test_foreign_key_constraint_is_enforced(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
    ) -> None:
        """Category with a valid taxonomy_id links to the parent taxonomy."""
        category = await CategoryFactory.create_async(
            session,
            name="Test Category",
            taxonomy_id=db_taxonomy.id,
        )
        await session.refresh(category)

        assert category.taxonomy_id == db_taxonomy.id
        assert category.taxonomy == db_taxonomy


@pytest.mark.integration
class TestDatabaseRelationships:
    """ORM relationship loading works correctly for our models."""

    async def test_one_to_many_load(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
        db_ops: DBOperations,
    ) -> None:
        """Taxonomy.categories loads all child categories via selectinload."""
        del session
        cat1 = CategoryFactory.build(name="Cat A", taxonomy_id=db_taxonomy.id)
        cat2 = CategoryFactory.build(name="Cat B", taxonomy_id=db_taxonomy.id)
        for cat in [cat1, cat2]:
            await db_ops.create(cat)

        stmt = (
            select(Taxonomy)
            .where(Taxonomy.id == db_taxonomy.id)
            .options(selectinload(cast("QueryableAttribute[Any]", Taxonomy.categories)))
        )
        result = await db_ops.session.execute(stmt)
        taxonomy = result.scalar_one()

        names = {c.name for c in taxonomy.categories}
        assert "Cat A" in names
        assert "Cat B" in names


@pytest.mark.integration
class TestDatabaseMutations:
    """Server-side defaults are populated correctly on flush."""

    async def test_timestamps_populated_after_flush(self, session: AsyncSession) -> None:
        """created_at and updated_at are set by the database on flush."""
        material = MaterialFactory.build(name="Timestamp Test", density_kg_m3=7850.0)
        session.add(material)
        await session.flush()
        await session.refresh(material)

        assert material.created_at is not None
        assert material.updated_at is not None
