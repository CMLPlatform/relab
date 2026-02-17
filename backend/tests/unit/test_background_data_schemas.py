"""Unit tests for background data models (no database required)."""

import pytest
from pydantic import ValidationError

from app.api.background_data.models import TaxonomyDomain
from app.api.background_data.schemas import (
    CategoryCreate,
    CategoryUpdate,
    MaterialCreate,
    MaterialUpdate,
    ProductTypeCreate,
    TaxonomyCreate,
    TaxonomyUpdate,
)


@pytest.mark.unit
class TestTaxonomySchemas:
    """Test Taxonomy schema validation."""

    def test_taxonomy_create_valid(self):
        """Test creating valid TaxonomyCreate schema."""
        data = {
            "name": "Test Taxonomy",
            "version": "v1.0.0",
            "description": "A test taxonomy",
            "domains": {"materials"},
            "source": "https://example.com",
        }
        schema = TaxonomyCreate(**data)

        assert schema.name == "Test Taxonomy"
        assert schema.version == "v1.0.0"
        assert schema.domains == {TaxonomyDomain.MATERIALS}

    def test_taxonomy_create_name_too_short(self):
        """Test TaxonomyCreate rejects name that's too short."""
        with pytest.raises(ValidationError) as exc_info:
            TaxonomyCreate(
                name="A",  # Too short
                version="v1.0.0",
                domains={"materials"},
            )

        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "name" for e in errors)

    def test_taxonomy_create_multiple_domains(self):
        """Test taxonomy with multiple domains."""
        schema = TaxonomyCreate(
            name="Multi-domain Taxonomy",
            version="v1.0.0",
            domains={"materials", "products"},
        )

        assert len(schema.domains) == 2
        assert TaxonomyDomain.MATERIALS in schema.domains
        assert TaxonomyDomain.PRODUCTS in schema.domains

    def test_taxonomy_update_partial(self):
        """Test TaxonomyUpdate with partial data."""
        schema = TaxonomyUpdate(name="Updated Name", domains={"materials"})

        assert schema.name == "Updated Name"
        assert schema.version is None
        assert schema.description is None


@pytest.mark.unit
class TestCategorySchemas:
    """Test Category schema validation."""

    def test_category_create_valid(self):
        """Test creating valid CategoryCreate schema."""
        schema = CategoryCreate(
            name="Test Category",
            description="A test category",
            taxonomy_id=1,
        )

        assert schema.name == "Test Category"
        assert schema.taxonomy_id == 1

    def test_category_create_minimal(self):
        """Test CategoryCreate with only required fields."""
        schema = CategoryCreate(name="Minimal Category")

        assert schema.name == "Minimal Category"
        assert schema.taxonomy_id is None

    def test_category_update_partial(self):
        """Test CategoryUpdate with partial data."""
        schema = CategoryUpdate(name="Updated Category")

        assert schema.name == "Updated Category"
        assert schema.description is None


@pytest.mark.unit
class TestMaterialSchemas:
    """Test Material schema validation."""

    def test_material_create_valid(self):
        """Test creating valid MaterialCreate schema."""
        schema = MaterialCreate(
            name="Steel",
            description="Iron-carbon alloy",
            density_kg_m3=7850.0,
            is_crm=False,
        )

        assert schema.name == "Steel"
        assert schema.density_kg_m3 == 7850.0
        assert schema.is_crm is False

    def test_material_create_negative_density_fails(self):
        """Test MaterialCreate rejects negative density."""
        with pytest.raises(ValidationError) as exc_info:
            MaterialCreate(
                name="Invalid Material",
                density_kg_m3=-100.0,
            )

        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "density_kg_m3" for e in errors)

    def test_material_create_zero_density_fails(self):
        """Test MaterialCreate rejects zero density."""
        with pytest.raises(ValidationError):
            MaterialCreate(
                name="Invalid Material",
                density_kg_m3=0.0,
            )

    def test_material_update_partial(self):
        """Test MaterialUpdate with partial data."""
        schema = MaterialUpdate(density_kg_m3=8000.0)

        assert schema.density_kg_m3 == 8000.0
        assert schema.name is None


@pytest.mark.unit
class TestProductTypeSchemas:
    """Test ProductType schema validation."""

    def test_product_type_create_valid(self):
        """Test creating valid Product TypeCreate schema."""
        schema = ProductTypeCreate(
            name="Electronics",
            description="Electronic products",
        )

        assert schema.name == "Electronics"
        assert schema.description == "Electronic products"

    def test_product_type_create_minimal(self):
        """Test ProductTypeCreate with only name."""
        schema = ProductTypeCreate(name="Minimal")

        assert schema.name == "Minimal"
        assert schema.description is None
