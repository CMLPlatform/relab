"""Validation tests for background data models."""

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain
from tests.factories import CategoryFactory, MaterialFactory, ProductTypeFactory, TaxonomyFactory


class TestTaxonomyValidation:
    """Test validation for Taxonomy model."""

    async def test_name_length_constraints(self, db_session: AsyncSession) -> None:
        """Test taxonomy name length validation."""
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Min 2 characters
        with pytest.raises(ValidationError, match="at least 2 characters"):
            TaxonomyFactory.create(name="A")

        # Max 100 characters
        with pytest.raises(ValidationError, match="at most 100 characters"):
            TaxonomyFactory.create(name="A" * 101)

        # Valid
        taxonomy = TaxonomyFactory.create(name="ValidName")
        assert taxonomy.name == "ValidName"

    async def test_version_validation(self, db_session: AsyncSession) -> None:
        """Test version field validation."""
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Min 1 character (if provided)
        with pytest.raises(ValidationError, match="at least 1 character"):
            TaxonomyFactory.create(version="")

        # Max 50 characters
        with pytest.raises(ValidationError, match="at most 50 characters"):
            TaxonomyFactory.create(version="A" * 51)

        # Valid
        taxonomy = TaxonomyFactory.create(version="v1.0.0")
        assert taxonomy.version == "v1.0.0"

    async def test_domains_field(self, db_session: AsyncSession) -> None:
        """Test domains field accepts valid enum values."""
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Valid single domain
        taxonomy1 = TaxonomyFactory.create(domains={TaxonomyDomain.MATERIALS})
        assert TaxonomyDomain.MATERIALS in taxonomy1.domains

        # Multiple domains
        taxonomy2 = TaxonomyFactory.create(domains={TaxonomyDomain.MATERIALS, TaxonomyDomain.PRODUCTS})
        assert len(taxonomy2.domains) == 2

    async def test_description_max_length(self, db_session: AsyncSession) -> None:
        """Test description max length."""
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 500 characters"):
            TaxonomyFactory.create(description="A" * 501)

        taxonomy = TaxonomyFactory.create(description="A" * 500)
        assert len(taxonomy.description) == 500


class TestCategoryValidation:
    """Test validation for Category model."""

    async def test_name_length_constraints(self, db_session: AsyncSession) -> None:
        """Test category name length validation."""
        CategoryFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Min 2 characters
        with pytest.raises(ValidationError, match="at least 2 characters"):
            CategoryFactory.create(name="A")

        # Max 250 characters
        with pytest.raises(ValidationError, match="at most 250 characters"):
            CategoryFactory.create(name="A" * 251)

        # Valid
        category = CategoryFactory.create(name="ValidCategory")
        assert category.name == "ValidCategory"

    async def test_taxonomy_relationship_required(self, db_session: AsyncSession) -> None:
        """Test that category must belong to a taxonomy."""
        from sqlalchemy.exc import IntegrityError

        # Try to create category without taxonomy
        category = Category(name="Test Category")
        db_session.add(category)

        with pytest.raises(IntegrityError):
            await db_session.commit()

        await db_session.rollback()


class TestMaterialValidation:
    """Test validation for Material model."""

    async def test_name_length_constraints(self, db_session: AsyncSession) -> None:
        """Test material name length validation."""
        MaterialFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Min 2 characters
        with pytest.raises(ValidationError, match="at least 2 characters"):
            MaterialFactory.create(name="A")

        # Max 100 characters
        with pytest.raises(ValidationError, match="at most 100 characters"):
            MaterialFactory.create(name="A" * 101)

    async def test_density_must_be_positive(self, db_session: AsyncSession) -> None:
        """Test that density_kg_m3 must be positive if provided."""
        MaterialFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Zero density invalid
        with pytest.raises(ValidationError, match="greater than 0"):
            MaterialFactory.create(density_kg_m3=0)

        # Negative density invalid
        with pytest.raises(ValidationError, match="greater than 0"):
            MaterialFactory.create(density_kg_m3=-100)

        # Positive density valid
        material = MaterialFactory.create(density_kg_m3=1000.0)
        assert material.density_kg_m3 == 1000.0

    async def test_is_crm_boolean_field(self, db_session: AsyncSession) -> None:
        """Test is_crm boolean field."""
        MaterialFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Can be None
        material1 = MaterialFactory.create(is_crm=None)
        assert material1.is_crm is None

        # Can be True/False
        material2 = MaterialFactory.create(is_crm=True)
        assert material2.is_crm is True

        material3 = MaterialFactory.create(is_crm=False)
        assert material3.is_crm is False


class TestProductTypeValidation:
    """Test validation for ProductType model."""

    async def test_name_length_constraints(self, db_session: AsyncSession) -> None:
        """Test product type name length validation."""
        ProductTypeFactory._meta.sqlalchemy_session = db_session
        TaxonomyFactory._meta.sqlalchemy_session = db_session

        # Min 2 characters
        with pytest.raises(ValidationError, match="at least 2 characters"):
            ProductTypeFactory.create(name="A")

        # Max 100 characters
        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductTypeFactory.create(name="A" * 101)

        # Valid
        product_type = ProductTypeFactory.create(name="Electronics")
        assert product_type.name == "Electronics"
