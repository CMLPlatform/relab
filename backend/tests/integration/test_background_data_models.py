"""Integration tests for background data models (with database)."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)
from tests.fixtures.database import DBOperations


@pytest.mark.integration
class TestTaxonomyModel:
    """Integration tests for Taxonomy model."""

    async def test_create_taxonomy(self, session: AsyncSession):
        """Test creating taxonomy in database."""
        taxonomy = Taxonomy(
            name="Materials Taxonomy",
            version="v1.0.0",
            description="Test taxonomy",
            domains={TaxonomyDomain.MATERIALS},
            source="https://example.com",
        )
        session.add(taxonomy)
        await session.flush()
        await session.refresh(taxonomy)

        assert taxonomy.id is not None
        assert taxonomy.name == "Materials Taxonomy"
        assert taxonomy.created_at is not None
        assert taxonomy.updated_at is not None

    async def test_taxonomy_str_representation(self, db_taxonomy: Taxonomy):
        """Test Taxonomy __str__ method."""
        expected = f"{db_taxonomy.name} (id: {db_taxonomy.id})"
        assert str(db_taxonomy) == expected

    async def test_taxonomy_with_multiple_domains(self, session: AsyncSession):
        """Test taxonomy with multiple domains."""
        taxonomy = Taxonomy(
            name="Multi-domain Taxonomy",
            version="v1.0.0",
            description="Test",
            domains={TaxonomyDomain.MATERIALS, TaxonomyDomain.PRODUCTS},
        )
        session.add(taxonomy)
        await session.flush()
        await session.refresh(taxonomy)

        assert len(taxonomy.domains) == 2
        assert TaxonomyDomain.MATERIALS in taxonomy.domains
        assert TaxonomyDomain.PRODUCTS in taxonomy.domains

    async def test_taxonomy_cascades_delete_categories(self, session: AsyncSession, db_taxonomy: Taxonomy):
        """Test deleting taxonomy cascades to categories."""
        category = Category(
            name="Test Category",
            taxonomy_id=db_taxonomy.id,
        )
        session.add(category)
        await session.flush()
        category_id = category.id

        # Delete taxonomy
        await session.delete(db_taxonomy)
        await session.flush()

        # Verify category was deleted
        result = await session.get(Category, category_id)
        assert result is None

    async def test_list_taxonomies(self, session: AsyncSession, db_ops: DBOperations):
        """Test querying multiple taxonomies."""
        # Create multiple taxonomies
        for i in range(3):
            taxonomy = Taxonomy(
                name=f"Taxonomy {i}",
                version=f"v{i}.0.0",
                domains={TaxonomyDomain.MATERIALS},
            )
            await db_ops.create(taxonomy)

        # Query all
        taxonomies = await db_ops.get_all(Taxonomy)
        assert len(taxonomies) >= 3


@pytest.mark.integration
class TestCategoryModel:
    """Integration tests for Category model."""

    async def test_create_category(self, session: AsyncSession, db_taxonomy: Taxonomy):
        """Test creating category in database."""
        category = Category(
            name="Metals",
            description="Metal materials",
            external_id="EXT123",
            taxonomy_id=db_taxonomy.id,
        )
        session.add(category)
        await session.flush()
        await session.refresh(category)

        assert category.id is not None
        assert category.name == "Metals"
        assert category.external_id == "EXT123"
        assert category.taxonomy_id == db_taxonomy.id

    async def test_category_requires_taxonomy(self, session: AsyncSession):
        """Test category requires taxonomy_id (foreign key constraint)."""
        category = Category(name="Invalid Category")
        session.add(category)

        with pytest.raises(IntegrityError):
            await session.flush()

    async def test_category_with_subcategories(self, session: AsyncSession, db_category: Category):
        """Test self-referential relationship."""
        subcategory = Category(
            name="Ferrous Metals",
            description="Iron-based metals",
            taxonomy_id=db_category.taxonomy_id,
            supercategory_id=db_category.id,
        )
        session.add(subcategory)
        await session.flush()
        await session.refresh(db_category)
        await session.refresh(subcategory)

        assert subcategory.supercategory_id == db_category.id
        assert len(db_category.subcategories) == 1
        assert db_category.subcategories[0].id == subcategory.id

    async def test_recursive_category_structure(self, session: AsyncSession, db_taxonomy: Taxonomy):
        """Test multi-level category hierarchy."""
        # Create 3-level hierarchy: Metals -> Ferrous -> Steel
        metals = Category(name="Metals", taxonomy_id=db_taxonomy.id)
        session.add(metals)
        await session.flush()

        ferrous = Category(
            name="Ferrous",
            taxonomy_id=db_taxonomy.id,
            supercategory_id=metals.id,
        )
        session.add(ferrous)
        await session.flush()

        steel = Category(
            name="Steel",
            taxonomy_id=db_taxonomy.id,
            supercategory_id=ferrous.id,
        )
        session.add(steel)
        await session.flush()

        # Verify structure
        await session.refresh(metals)
        assert len(metals.subcategories) == 1
        assert metals.subcategories[0].name == "Ferrous"


@pytest.mark.integration
class TestMaterialModel:
    """Integration tests for Material model."""

    async def test_create_material(self, session: AsyncSession):
        """Test creating material in database."""
        material = Material(
            name="Steel",
            description="Iron-carbon alloy",
            source="https://example.com/steel",
            density_kg_m3=7850.0,
            is_crm=False,
        )
        session.add(material)
        await session.flush()
        await session.refresh(material)

        assert material.id is not None
        assert material.name == "Steel"
        assert material.density_kg_m3 == 7850.0

    async def test_material_with_minimal_fields(self, session: AsyncSession):
        """Test material with only required fields."""
        material = Material(name="Minimal Material")
        session.add(material)
        await session.flush()
        await session.refresh(material)

        assert material.id is not None
        assert material.description is None
        assert material.density_kg_m3 is None


@pytest.mark.integration
class TestProductTypeModel:
    """Integration tests for ProductType model."""

    async def test_create_product_type(self, session: AsyncSession):
        """Test creating product type in database."""
        product_type = ProductType(
            name="Electronics",
            description="Electronic products",
        )
        session.add(product_type)
        await session.flush()
        await session.refresh(product_type)

        assert product_type.id is not None
        assert product_type.name == "Electronics"


@pytest.mark.integration
class TestRelationships:
    """Integration tests for model relationships."""

    async def test_category_material_many_to_many(
        self, session: AsyncSession, db_category: Category, db_material: Material
    ):
        """Test many-to-many relationship between Category and Material."""
        link = CategoryMaterialLink(
            category_id=db_category.id,
            material_id=db_material.id,
        )
        session.add(link)
        await session.flush()

        # Reload with relationships eagerly loaded
        stmt = select(Category).where(Category.id == db_category.id).options(selectinload(Category.materials))
        result = await session.exec(stmt)
        category = result.one()

        stmt = select(Material).where(Material.id == db_material.id).options(selectinload(Material.categories))
        result = await session.exec(stmt)
        material = result.one()

        assert len(category.materials) == 1
        assert category.materials[0].id == db_material.id
        assert len(material.categories) == 1
        assert material.categories[0].id == db_category.id

    async def test_category_product_type_many_to_many(
        self, session: AsyncSession, db_category: Category, db_product_type: ProductType
    ):
        """Test many-to-many relationship between Category and ProductType."""
        link = CategoryProductTypeLink(
            category_id=db_category.id,
            product_type_id=db_product_type.id,
        )
        session.add(link)
        await session.flush()

        # Reload with relationships eagerly loaded
        stmt = select(Category).where(Category.id == db_category.id).options(selectinload(Category.product_types))
        result = await session.exec(stmt)
        category = result.one()

        assert len(category.product_types) == 1
        assert category.product_types[0].id == db_product_type.id

    async def test_taxonomy_categories_relationship(self, session: AsyncSession, db_taxonomy: Taxonomy):
        """Test one-to-many relationship between Taxonomy and Categories."""
        # Create multiple categories
        for i in range(3):
            category = Category(
                name=f"Category {i}",
                taxonomy_id=db_taxonomy.id,
            )
            session.add(category)

        await session.flush()

        # Reload with relationships eagerly loaded
        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.exec(stmt)
        taxonomy = result.one()

        assert len(taxonomy.categories) == 3  # 3 new categories created in this test
