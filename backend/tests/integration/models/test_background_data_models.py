"""Integration tests for background data models (with database)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.api.background_data.models import (
    Category,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)
from tests.factories.models import (
    CategoryFactory,
    CategoryMaterialLinkFactory,
    CategoryProductTypeLinkFactory,
    MaterialFactory,
    ProductTypeFactory,
    TaxonomyFactory,
)

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from tests.fixtures.database import DBOperations

# Constants for test values
MATERIALS_TAXONOMY = "Materials Taxonomy"
TAXONOMY_VERSION = "v1.0.0"
DESCRIPTION = "Test taxonomy"
SOURCE_URL = "https://example.com"
MULTI_DOMAIN_TAXONOMY = "Multi-domain Taxonomy"
TEST_CATEGORY = "Test Category"
METALS_CATEGORY = "Metals"
METALS_DESC = "Metal materials"
EXTERNAL_ID = "EXT123"
FERROUS_METALS = "Ferrous Metals"
FERROUS_DESC = "Iron-based metals"
STEEL_MATERIAL = "Steel"
STEEL_DESC = "Iron-carbon alloy"
ELECTRONICS_TYPE = "Electronics"
ELECTRONICS_DESC = "Electronic products"
STEEL_DENSITY = 7850.0
FERROUS = "Ferrous"


@pytest.mark.integration
class TestTaxonomyModel:
    """Integration tests for Taxonomy model."""

    async def test_create_taxonomy(self, session: AsyncSession) -> None:
        """Test creating taxonomy in database."""
        taxonomy = await TaxonomyFactory.create_async(
            session,
            name=MATERIALS_TAXONOMY,
            version=TAXONOMY_VERSION,
            description=DESCRIPTION,
            domains={TaxonomyDomain.MATERIALS},
            source=SOURCE_URL,
        )

        assert taxonomy.id is not None
        assert taxonomy.name == MATERIALS_TAXONOMY
        assert taxonomy.created_at is not None
        assert taxonomy.updated_at is not None

    async def test_taxonomy_str_representation(self, db_taxonomy: Taxonomy) -> None:
        """Test Taxonomy __str__ method."""
        expected = f"{db_taxonomy.name} (id: {db_taxonomy.id})"
        assert str(db_taxonomy) == expected

    async def test_taxonomy_with_multiple_domains(self, session: AsyncSession) -> None:
        """Test taxonomy with multiple domains."""
        taxonomy = await TaxonomyFactory.create_async(
            session,
            name=MULTI_DOMAIN_TAXONOMY,
            version=TAXONOMY_VERSION,
            description="Test",
            domains={TaxonomyDomain.MATERIALS, TaxonomyDomain.PRODUCTS},
        )

        assert len(taxonomy.domains) == 2
        assert TaxonomyDomain.MATERIALS in taxonomy.domains
        assert TaxonomyDomain.PRODUCTS in taxonomy.domains

    async def test_taxonomy_cascades_delete_categories(self, session: AsyncSession, db_taxonomy: Taxonomy) -> None:
        """Test deleting taxonomy cascades to categories."""
        category = await CategoryFactory.create_async(
            session,
            name=TEST_CATEGORY,
            taxonomy_id=db_taxonomy.id,
        )
        category_id = category.id

        # Delete taxonomy
        await session.delete(db_taxonomy)
        await session.flush()

        # Verify category was deleted
        result = await session.get(Category, category_id)
        assert result is None

    async def test_list_taxonomies(self, session: AsyncSession, db_ops: DBOperations) -> None:
        """Test querying multiple taxonomies."""
        # Create multiple taxonomies
        for i in range(3):
            await TaxonomyFactory.create_async(
                session,
                name=f"Taxonomy {i}",
                version=f"v{i}.0.0",
                domains={TaxonomyDomain.MATERIALS},
            )

        # Query all
        taxonomies = await db_ops.get_all(Taxonomy)
        assert len(taxonomies) >= 3


@pytest.mark.integration
class TestCategoryModel:
    """Integration tests for Category model."""

    async def test_create_category(self, session: AsyncSession, db_taxonomy: Taxonomy) -> None:
        """Test creating category in database."""
        category = await CategoryFactory.create_async(
            session,
            name=METALS_CATEGORY,
            description=METALS_DESC,
            external_id=EXTERNAL_ID,
            taxonomy_id=db_taxonomy.id,
        )

        assert category.id is not None
        assert category.name == METALS_CATEGORY
        assert category.external_id == EXTERNAL_ID
        assert category.taxonomy_id == db_taxonomy.id

    async def test_category_requires_taxonomy(self, session: AsyncSession) -> None:
        """Test category requires taxonomy_id (foreign key constraint)."""
        category = CategoryFactory.build(name="Invalid Category")
        session.add(category)

        with pytest.raises(IntegrityError):
            await session.flush()

    async def test_category_with_subcategories(self, session: AsyncSession, db_category: Category) -> None:
        """Test self-referential relationship."""
        subcategory = await CategoryFactory.create_async(
            session,
            name=FERROUS_METALS,
            description=FERROUS_DESC,
            taxonomy_id=db_category.taxonomy_id,
            supercategory_id=db_category.id,
        )
        await session.refresh(db_category)

        assert subcategory.supercategory_id == db_category.id
        assert db_category.subcategories is not None
        assert len(db_category.subcategories) == 1
        assert db_category.subcategories[0].id == subcategory.id

    async def test_recursive_category_structure(self, session: AsyncSession, db_taxonomy: Taxonomy) -> None:
        """Test multi-level category hierarchy."""
        # Create 3-level hierarchy: Metals -> Ferrous -> Steel
        metals = await CategoryFactory.create_async(session, name=METALS_CATEGORY, taxonomy_id=db_taxonomy.id)

        ferrous = await CategoryFactory.create_async(
            session,
            name=FERROUS,
            taxonomy_id=db_taxonomy.id,
            supercategory_id=metals.id,
        )

        await CategoryFactory.create_async(
            session,
            name=STEEL_MATERIAL,
            taxonomy_id=db_taxonomy.id,
            supercategory_id=ferrous.id,
        )

        # Verify structure
        await session.refresh(metals)
        assert metals.subcategories is not None
        assert len(metals.subcategories) == 1
        assert metals.subcategories[0].name == FERROUS


@pytest.mark.integration
class TestMaterialModel:
    """Integration tests for Material model."""

    async def test_create_material(self, session: AsyncSession) -> None:
        """Test creating material in database."""
        material = await MaterialFactory.create_async(
            session,
            name=STEEL_MATERIAL,
            description=STEEL_DESC,
            source=SOURCE_URL,
            density_kg_m3=STEEL_DENSITY,
            is_crm=False,
        )

        assert material.id is not None
        assert material.name == STEEL_MATERIAL
        assert material.density_kg_m3 == STEEL_DENSITY

    async def test_material_with_minimal_fields(self, session: AsyncSession) -> None:
        """Test material with only required fields."""
        material = MaterialFactory.build(name="Minimal Material", description=None, density_kg_m3=None)
        session.add(material)
        await session.flush()
        await session.refresh(material)

        assert material.id is not None
        assert material.description is None
        assert material.density_kg_m3 is None


@pytest.mark.integration
class TestProductTypeModel:
    """Integration tests for ProductType model."""

    async def test_create_product_type(self, session: AsyncSession) -> None:
        """Test creating product type in database."""
        product_type = await ProductTypeFactory.create_async(
            session,
            name=ELECTRONICS_TYPE,
            description=ELECTRONICS_DESC,
        )

        assert product_type.id is not None
        assert product_type.name == ELECTRONICS_TYPE


@pytest.mark.integration
class TestRelationships:
    """Integration tests for model relationships."""

    async def test_category_material_many_to_many(
        self, session: AsyncSession, db_category: Category, db_material: Material
    ) -> None:
        """Test many-to-many relationship between Category and Material."""
        await CategoryMaterialLinkFactory.create_async(
            session,
            category_id=db_category.id,
            material_id=db_material.id,
        )

        # Reload with relationships eagerly loaded
        stmt = select(Category).where(Category.id == db_category.id).options(selectinload(Category.materials))
        result = await session.exec(stmt)
        category = result.one()

        stmt = select(Material).where(Material.id == db_material.id).options(selectinload(Material.categories))
        result = await session.exec(stmt)
        material = result.one()

        assert category.materials is not None
        assert len(category.materials) == 1
        assert category.materials[0].id == db_material.id
        assert material.categories is not None
        assert len(material.categories) == 1
        assert material.categories[0].id == db_category.id

    async def test_category_product_type_many_to_many(
        self, session: AsyncSession, db_category: Category, db_product_type: ProductType
    ) -> None:
        """Test many-to-many relationship between Category and ProductType."""
        await CategoryProductTypeLinkFactory.create_async(
            session,
            category_id=db_category.id,
            product_type_id=db_product_type.id,
        )

        # Reload with relationships eagerly loaded
        stmt = select(Category).where(Category.id == db_category.id).options(selectinload(Category.product_types))
        result = await session.exec(stmt)
        category = result.one()

        assert category.product_types is not None
        assert len(category.product_types) == 1
        assert category.product_types[0].id == db_product_type.id

    async def test_taxonomy_categories_relationship(self, session: AsyncSession, db_taxonomy: Taxonomy) -> None:
        """Test one-to-many relationship between Taxonomy and Categories."""
        # Create multiple categories
        for i in range(3):
            await CategoryFactory.create_async(
                session,
                name=f"Category {i}",
                taxonomy_id=db_taxonomy.id,
            )

        await session.flush()

        # Reload with relationships eagerly loaded
        stmt = select(Taxonomy).where(Taxonomy.id == db_taxonomy.id).options(selectinload(Taxonomy.categories))
        result = await session.exec(stmt)
        taxonomy = result.one()

        assert len(taxonomy.categories) == 3  # 3 new categories created in this test
