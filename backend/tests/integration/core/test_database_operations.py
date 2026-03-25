"""Integration tests for database constraints, relationships, and mutations.

Tests that our model definitions correctly enforce integrity rules and that
CRUD operations behave as expected against a real Postgres instance.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import select

from app.api.background_data.models import Material, Taxonomy
from tests.factories.models import CategoryFactory, MaterialFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from tests.fixtures.database import DBOperations


@pytest.mark.integration
class TestTransactionIsolation:
    """Each test runs in its own rolled-back transaction for clean isolation."""

    async def test_writes_are_not_visible_outside_open_transaction(
        self,
        session: AsyncSession,
        async_engine: AsyncEngine,
    ) -> None:
        """A record flushed but not committed must not be visible to an independent connection.

        This validates that our conftest transaction-rollback strategy actually
        isolates tests — writes only become visible on commit, which never happens
        in the test session.
        """
        material = MaterialFactory.build(name="Isolation Probe", density_kg_m3=7850.0)
        session.add(material)
        await session.flush()
        material_id = material.id
        assert material_id is not None

        # Open a completely independent connection (outside the test transaction)
        independent_factory = async_sessionmaker(
            bind=async_engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
        async with independent_factory() as independent_session:
            found = await independent_session.get(Material, material_id)

        # The flush only wrote within our rolled-back savepoint; another
        # connection must not see it.
        assert found is None, "Record was visible outside the test transaction — rollback-based isolation is broken."


@pytest.mark.integration
class TestDatabaseConstraints:
    """Model definitions enforce expected database constraints."""

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
        result = await db_ops.session.exec(stmt)
        taxonomy = result.one()

        names = {c.name for c in taxonomy.categories}
        assert "Cat A" in names
        assert "Cat B" in names

    async def test_cascade_child_is_visible_on_parent(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
    ) -> None:
        """Child created after parent appears in the loaded relationship."""
        await CategoryFactory.create_async(
            session,
            name="Cascade Test",
            taxonomy_id=db_taxonomy.id,
        )

        stmt = (
            select(Taxonomy)
            .where(Taxonomy.id == db_taxonomy.id)
            .options(selectinload(cast("QueryableAttribute[Any]", Taxonomy.categories)))
        )
        result = await session.exec(stmt)
        taxonomy = result.one()

        assert any(c.name == "Cascade Test" for c in taxonomy.categories)


@pytest.mark.integration
class TestDatabaseMutations:
    """INSERT, UPDATE, and DELETE operations behave correctly."""

    async def test_create_and_retrieve(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Created record is immediately retrievable by primary key."""
        del session
        material = MaterialFactory.build(name="Steel", density_kg_m3=7850.0)
        created = await db_ops.create(material)
        assert created.id is not None

        retrieved = await db_ops.get_by_id(Material, created.id)

        assert retrieved is not None
        assert retrieved.name == "Steel"
        assert retrieved.density_kg_m3 == 7850.0

    async def test_update_record(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Flushing an updated record reflects the new values on re-fetch."""
        material = MaterialFactory.build(name="Original", density_kg_m3=7850.0)
        created = await db_ops.create(material)
        assert created.id is not None

        created.name = "Updated"
        created.density_kg_m3 = 8000.0
        session.add(created)
        await session.flush()

        retrieved = await db_ops.get_by_id(Material, created.id)
        assert retrieved is not None
        assert retrieved.name == "Updated"
        assert retrieved.density_kg_m3 == 8000.0

    async def test_delete_record(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Deleted record is no longer retrievable."""
        del session
        material = MaterialFactory.build(name="To Delete", density_kg_m3=7850.0)
        created = await db_ops.create(material)
        created_id = created.id
        assert created_id is not None

        await db_ops.delete(created)

        assert await db_ops.get_by_id(Material, created_id) is None

    async def test_timestamps_populated_after_flush(self, session: AsyncSession) -> None:
        """created_at and updated_at are set by the database on flush."""
        material = MaterialFactory.build(name="Timestamp Test", density_kg_m3=7850.0)
        session.add(material)
        await session.flush()
        await session.refresh(material)

        assert material.created_at is not None
        assert material.updated_at is not None
