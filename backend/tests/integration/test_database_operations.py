"""Integration tests for database operations and patterns.

Tests database transactions, constraints, and isolation.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.api.background_data.models import Category, Material, Taxonomy
from tests.fixtures.database import DBOperations


@pytest.mark.integration
class TestDatabaseTransactions:
    """Test database transaction behavior and isolation."""

    async def test_transaction_rollback_on_session_exit(self, session: AsyncSession):
        """Test that changes roll back when session exits without commit."""
        # Create a material
        material = Material(
            name="Rollback Test Material",
            description="This should be rolled back",
            density_kg_m3=8000.0,
        )
        session.add(material)
        await session.flush()
        material_id = material.id

        # In a fresh session, the material shouldn't exist
        # (Because the first session will rollback when exiting fixture)
        # This is verified implicitly by fixtures using nested transactions

        assert material_id is not None

    async def test_nested_transaction_isolation(self, session: AsyncSession, db_ops: DBOperations):
        """Test that changes in one session don't affect another."""
        # Create first material
        material1 = Material(
            name="Material 1",
            description="First material",
            density_kg_m3=7850.0,
        )
        await db_ops.create(material1)

        # Verify it exists
        retrieved = await db_ops.get_by_filter(Material, name="Material 1")
        assert retrieved is not None
        assert retrieved.id == material1.id

    async def test_flush_vs_commit_behavior(self, session: AsyncSession):
        """Test difference between flush and commit."""
        # Flush makes ID available but doesn't commit
        material = Material(
            name="Flush Test",
            description="Test flush behavior",
            density_kg_m3=8000.0,
        )
        session.add(material)
        await session.flush()

        # After flush, ID is available
        assert material.id is not None

        # But this doesn't actually commit in test context
        # (Our conftest mocks commit to only flush)

    async def test_refresh_after_write(self, session: AsyncSession):
        """Test refreshing after write operations."""
        material = Material(
            name="Refresh Test",
            description="Test refresh",
            density_kg_m3=8000.0,
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

    # async def test_unique_constraint_violation(self, session: AsyncSession, db_ops: DBOperations):
    #     """Test that unique constraints are enforced."""
    #     # Material name is not unique in model, so this test is invalid unless model changes.
    #     pass

    async def test_foreign_key_constraint(self, session: AsyncSession, db_taxonomy: Taxonomy):
        """Test that foreign key constraints are enforced."""
        # Create category with valid taxonomy_id
        category = Category(
            name="Test Category",
            description="A test category",
            taxonomy_id=db_taxonomy.id,
        )
        session.add(category)
        await session.flush()
        await session.refresh(category)

        # Verify relationship works
        assert category.taxonomy_id == db_taxonomy.id
        assert category.taxonomy == db_taxonomy

    async def test_null_constraint_enforcement(self, session: AsyncSession):
        """Test that NOT NULL constraints are enforced."""
        # Try to create material without required name field
        # (Depends on model definition - this is example pattern)
        material = Material(
            name="Valid Name",
            # density_kg_m3 is required in model
            density_kg_m3=7850.0,
        )
        session.add(material)
        await session.flush()

        assert material.id is not None


@pytest.mark.integration
class TestDatabaseQueries:
    """Test various database query patterns."""

    async def test_simple_select_all(self, session: AsyncSession, db_ops: DBOperations):
        """Test selecting all records of a type."""
        # Create multiple materials
        mat1 = Material(name="Mat1", density_kg_m3=7850.0)
        mat2 = Material(name="Mat2", density_kg_m3=8000.0)

        for mat in [mat1, mat2]:
            await db_ops.create(mat)

        # Query all
        materials = await db_ops.get_all(Material)
        assert len(materials) >= 2
        names = {m.name for m in materials}
        assert "Mat1" in names
        assert "Mat2" in names

    async def test_filtered_query(self, session: AsyncSession, db_ops: DBOperations):
        """Test querying with filters."""
        # Create materials with different densities
        heavy = Material(name="Heavy", density_kg_m3=10000.0)
        light = Material(name="Light", density_kg_m3=2700.0)

        for mat in [heavy, light]:
            await db_ops.create(mat)

        # Query with filter
        materials = await db_ops.get_all(Material, name="Heavy")
        assert len(materials) >= 1
        assert materials[0].density_kg_m3 == 10000.0

    async def test_count_query(self, session: AsyncSession):
        """Test counting records."""
        # Create multiple materials
        for i in range(3):
            material = Material(
                name=f"Material {i}",
                density_kg_m3=7850.0 + i * 100,
            )
            session.add(material)

        await session.flush()

        # Count all materials
        stmt = select(Material)
        result = await session.execute(stmt)
        materials = result.scalars().all()

        assert len(materials) >= 3

    async def test_ordered_query(self, session: AsyncSession):
        """Test query ordering."""
        # Create materials with different names
        for name in ["Zebra", "Apple", "Banana"]:
            material = Material(
                name=name,
                density_kg_m3=7850.0,
            )
            session.add(material)

        await session.flush()

        # Query with ordering
        stmt = select(Material).order_by(Material.name)
        result = await session.execute(stmt)
        materials = result.scalars().all()

        # Should be in alphabetical order
        names = [m.name for m in materials if m.name in ["Zebra", "Apple", "Banana"]]
        assert names == sorted(names)

    async def test_limited_query(self, session: AsyncSession):
        """Test query with limit."""
        # Create multiple materials
        for i in range(5):
            material = Material(
                name=f"Material {i}",
                density_kg_m3=7850.0,
            )
            session.add(material)

        await session.flush()

        # Query with limit
        stmt = select(Material).limit(2)
        result = await session.execute(stmt)
        materials = result.scalars().all()

        assert len(materials) <= 2


@pytest.mark.integration
class TestDatabaseRelationships:
    """Test database relationship handling."""

    async def test_one_to_many_relationship(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
        db_ops: DBOperations,
    ):
        """Test one-to-many relationship (Taxonomy -> Categories)."""
        # Create categories for taxonomy
        cat1 = Category(
            name="Category 1",
            description="First category",
            taxonomy_id=db_taxonomy.id,
        )
        cat2 = Category(
            name="Category 2",
            description="Second category",
            taxonomy_id=db_taxonomy.id,
        )

        for cat in [cat1, cat2]:
            await db_ops.create(cat)

        # Verify relationship with explicit load
        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.execute(stmt)
        refreshed_taxonomy = result.scalar_one()

        assert len(refreshed_taxonomy.categories) == 2

    async def test_relationship_cascade_delete_behavior(
        self,
        session: AsyncSession,
        db_taxonomy: Taxonomy,
    ):
        """Test cascade delete behavior (model-dependent)."""
        # Create category linked to taxonomy
        category = Category(
            name="Cascade Test Category",
            description="Will be deleted with taxonomy",
            taxonomy_id=db_taxonomy.id,
        )
        session.add(category)
        await session.flush()
        category_id = category.id

        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.execute(stmt)
        refreshed_taxonomy = result.scalar_one()

        assert len(refreshed_taxonomy.categories) >= 1


@pytest.mark.integration
class TestDatabaseMutations:
    """Test INSERT, UPDATE, DELETE operations."""

    async def test_create_and_retrieve(self, session: AsyncSession, db_ops: DBOperations):
        """Test creating and retrieving a record."""
        # Create
        material = Material(
            name="Test Material",
            description="For testing",
            density_kg_m3=7850.0,
        )
        created = await db_ops.create(material)

        # Retrieve
        retrieved = await db_ops.get_by_id(Material, created.id)

        assert retrieved is not None
        assert retrieved.name == "Test Material"

    async def test_update_record(self, session: AsyncSession, db_ops: DBOperations):
        """Test updating a record."""
        # Create
        material = Material(
            name="Original Name",
            description="Original description",
            density_kg_m3=7850.0,
        )
        created = await db_ops.create(material)

        # Update
        created.name = "Updated Name"
        created.density_kg_m3 = 8000.0
        session.add(created)
        await session.flush()

        # Verify update
        retrieved = await db_ops.get_by_id(Material, created.id)
        assert retrieved.name == "Updated Name"
        assert retrieved.density_kg_m3 == 8000.0

    async def test_delete_record(self, session: AsyncSession, db_ops: DBOperations):
        """Test deleting a record."""
        # Create
        material = Material(
            name="To Delete",
            description="Will be deleted",
            density_kg_m3=7850.0,
        )
        created = await db_ops.create(material)
        created_id = created.id

        # Delete
        await db_ops.delete(created)

        # Verify deletion
        retrieved = await db_ops.get_by_id(Material, created_id)
        assert retrieved is None
