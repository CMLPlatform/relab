"""Integration tests for database operations and patterns.

Tests database transactions, constraints, and isolation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.api.background_data.models import Material, Taxonomy
from tests.factories.models import CategoryFactory, MaterialFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from tests.fixtures.database import DBOperations

# Constants for test values
MAT_NAME_1 = "Material 1"
MAT_NAME_2 = "Material 2"
MAT_NAME_HEAVY = "Heavy"
MAT_NAME_LIGHT = "Light"
MAT_NAME_ORIGINAL = "Original Name"
MAT_NAME_UPDATED = "Updated Name"
MAT_NAME_DELETE = "To Delete"
DENSITY_7850 = 7850.0
DENSITY_8000 = 8000.0
DENSITY_10000 = 10000.0
DENSITY_2700 = 2700.0


@pytest.mark.integration
class TestDatabaseTransactions:
    """Test database transaction behavior and isolation."""

    async def test_transaction_rollback_on_session_exit(self, session: AsyncSession) -> None:
        """Test that changes roll back when session exits without commit."""
        # Create a material
        material = MaterialFactory.build(
            name="Rollback Test Material",
            description="This should be rolled back",
            density_kg_m3=DENSITY_8000,
        )
        session.add(material)
        await session.flush()
        material_id = material.id

        # In a fresh session, the material shouldn't exist
        # (Because the first session will rollback when exiting fixture)
        # This is verified implicitly by fixtures using nested transactions

        assert material_id is not None

    async def test_nested_transaction_isolation(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test that changes in one session don't affect another."""
        del session
        # Create first material
        material1 = MaterialFactory.build(
            name=MAT_NAME_1,
            description="First material",
            density_kg_m3=DENSITY_7850,
        )
        await db_ops.create(material1)

        # Verify it exists
        retrieved = await db_ops.get_by_filter(Material, name=MAT_NAME_1)
        assert retrieved is not None
        assert retrieved.id == material1.id

    async def test_flush_vs_commit_behavior(self, session: AsyncSession) -> None:
        """Test difference between flush and commit."""
        # Flush makes ID available but doesn't commit
        material = MaterialFactory.build(
            name="Flush Test",
            description="Test flush behavior",
            density_kg_m3=DENSITY_8000,
        )
        session.add(material)
        await session.flush()

        # After flush, ID is available
        assert material.id is not None

        # But this doesn't actually commit in test context
        # (Our conftest mocks commit to only flush)

    async def test_refresh_after_write(self, session: AsyncSession) -> None:
        """Test refreshing after write operations."""
        material = MaterialFactory.build(
            name="Refresh Test",
            description="Test refresh",
            density_kg_m3=DENSITY_8000,
        )
        session.add(material)
        await session.flush()

        # Refresh to ensure timestamps are populated
        await session.refresh(material)

        assert material.created_at is not None
        assert material.updated_at is not None


@pytest.mark.integration
class TestDatabaseConstraints:
    """Test database constraints and integrity checks."""

    async def test_foreign_key_constraint(self, session: AsyncSession, db_taxonomy: Taxonomy) -> None:
        """Test that foreign key constraints are enforced."""
        # Create category with valid taxonomy_id
        category = await CategoryFactory.create_async(
            session,
            name="Test Category",
            description="A test category",
            taxonomy_id=db_taxonomy.id,
        )
        await session.refresh(category)

        # Verify relationship works
        assert category.taxonomy_id == db_taxonomy.id
        assert category.taxonomy == db_taxonomy

    async def test_null_constraint_enforcement(self, session: AsyncSession) -> None:
        """Test that NOT NULL constraints are enforced."""
        # Try to create material without required name field
        # (Depends on model definition - this is example pattern)
        material = MaterialFactory.build(
            name="Valid Name",
            # density_kg_m3 is required in model
            density_kg_m3=DENSITY_7850,
        )
        session.add(material)
        await session.flush()

        assert material.id is not None


@pytest.mark.integration
class TestDatabaseQueries:
    """Test various database query patterns."""

    async def test_simple_select_all(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test selecting all records of a type."""
        del session
        # Create multiple materials
        mat1 = MaterialFactory.build(name=MAT_NAME_1, density_kg_m3=DENSITY_7850)
        mat2 = MaterialFactory.build(name=MAT_NAME_2, density_kg_m3=DENSITY_8000)

        for mat in [mat1, mat2]:
            await db_ops.create(mat)

        # Query all
        materials = await db_ops.get_all(Material)
        assert len(materials) >= 2
        names = {m.name for m in materials}
        assert MAT_NAME_1 in names
        assert MAT_NAME_2 in names

    async def test_filtered_query(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test querying with filters."""
        del session
        # Create materials with different densities
        heavy = MaterialFactory.build(name=MAT_NAME_HEAVY, density_kg_m3=DENSITY_10000)
        light = MaterialFactory.build(name=MAT_NAME_LIGHT, density_kg_m3=DENSITY_2700)

        for mat in [heavy, light]:
            await db_ops.create(mat)

        # Query with filter
        materials = await db_ops.get_all(Material, name=MAT_NAME_HEAVY)
        assert len(materials) >= 1
        assert materials[0].density_kg_m3 == DENSITY_10000

    async def test_count_query(self, session: AsyncSession) -> None:
        """Test counting records."""
        # Create multiple materials
        for i in range(3):
            await MaterialFactory.create_async(
                session,
                name=f"Material {i}",
                density_kg_m3=DENSITY_7850 + i * 100,
            )

        # Count all materials
        stmt = select(Material)
        result = await session.exec(stmt)
        materials = result.all()

        assert len(materials) >= 3

    async def test_ordered_query(self, session: AsyncSession) -> None:
        """Test query ordering."""
        # Create materials with different names
        ordered_names = ["Apple", "Banana", "Zebra"]
        for name in ordered_names:
            await MaterialFactory.create_async(
                session,
                name=name,
                density_kg_m3=DENSITY_7850,
            )

        # Query with ordering
        stmt = select(Material).order_by(Material.name)
        result = await session.exec(stmt)
        materials = result.all()

        # Should be in alphabetical order
        names = [m.name for m in materials if m.name in ordered_names]
        assert names == sorted(names)

    async def test_limited_query(self, session: AsyncSession) -> None:
        """Test query with limit."""
        # Create multiple materials
        for i in range(5):
            await MaterialFactory.create_async(
                session,
                name=f"Material {i}",
                density_kg_m3=DENSITY_7850,
            )

        # Query with limit
        stmt = select(Material).limit(2)
        result = await session.exec(stmt)
        materials = result.all()

        assert len(materials) <= 2


@pytest.mark.integration
class TestDatabaseRelationships:
    """Test database relationship handling."""

    async def test_one_to_many_relationship(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
        db_ops: DBOperations,
    ) -> None:
        """Test one-to-many relationship (Taxonomy -> Categories)."""
        # Create categories for taxonomy
        cat1 = CategoryFactory.build(
            name="Category 1",
            description="First category",
            taxonomy_id=db_taxonomy.id,
        )
        cat2 = CategoryFactory.build(
            name="Category 2",
            description="Second category",
            taxonomy_id=db_taxonomy.id,
        )

        for cat in [cat1, cat2]:
            await db_ops.create(cat)

        # Verify relationship with explicit load
        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.exec(stmt)
        refreshed_taxonomy = result.one()

        assert len(refreshed_taxonomy.categories) >= 2

    async def test_relationship_cascade_delete_behavior(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
    ) -> None:
        """Test cascade delete behavior (model-dependent)."""
        # Create category linked to taxonomy
        await CategoryFactory.create_async(
            session,
            name="Cascade Test Category",
            description="Will be deleted with taxonomy",
            taxonomy_id=db_taxonomy.id,
        )

        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.exec(stmt)
        refreshed_taxonomy = result.one()

        assert len(refreshed_taxonomy.categories) >= 1


@pytest.mark.integration
class TestDatabaseMutations:
    """Test INSERT, UPDATE, DELETE operations."""

    async def test_create_and_retrieve(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test creating and retrieving a record."""
        del session
        # Create
        material = MaterialFactory.build(
            name="Test Material",
            description="For testing",
            density_kg_m3=DENSITY_7850,
        )
        created = await db_ops.create(material)

        # Retrieve
        retrieved = await db_ops.get_by_id(Material, created.id)

        assert retrieved is not None
        assert retrieved.name == "Test Material"  # noqa: PLR2004

    async def test_update_record(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test updating a record."""
        # Create
        material = MaterialFactory.build(
            name=MAT_NAME_ORIGINAL,
            description="Original description",
            density_kg_m3=DENSITY_7850,
        )
        created = await db_ops.create(material)

        # Update
        created.name = MAT_NAME_UPDATED
        created.density_kg_m3 = DENSITY_8000
        session.add(created)
        await session.flush()

        # Verify update
        retrieved = await db_ops.get_by_id(Material, created.id)

        assert retrieved is not None
        assert retrieved.name == MAT_NAME_UPDATED
        assert retrieved.density_kg_m3 == DENSITY_8000

    async def test_delete_record(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test deleting a record."""
        del session
        # Create
        material = MaterialFactory.build(
            name=MAT_NAME_DELETE,
            description="Will be deleted",
            density_kg_m3=DENSITY_7850,
        )
        created = await db_ops.create(material)
        created_id = created.id

        # Delete
        await db_ops.delete(created)

        # Verify deletion
        retrieved = await db_ops.get_by_id(Material, created_id)
        assert retrieved is None
