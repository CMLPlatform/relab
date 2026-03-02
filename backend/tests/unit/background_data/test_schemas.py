"""Unit tests for background data schemas (no database required)."""

from __future__ import annotations

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

# Constants for test values to avoid magic value warnings
TEST_TAXONOMY = "Test Taxonomy"
VERSION_V1 = "v1.0.0"
UPDATED_NAME = "Updated Name"
TEST_CATEGORY = "Test Category"
MINIMAL_CATEGORY = "Minimal Category"
UPDATED_CATEGORY = "Updated Category"
STEEL = "Steel"
ELECTRONICS = "Electronics"
ELECTRONIC_PRODUCTS = "Electronic products"
MINIMAL = "Minimal"
DENSITY_STEEL = 7850.0
DENSITY_UPDATED = 8000.0
LOC_NAME = "name"
LOC_DENSITY = "density_kg_m3"


@pytest.mark.unit
class TestTaxonomySchemas:
    """Test Taxonomy schema validation."""

    def test_taxonomy_create_valid(self) -> None:
        """Test creating valid TaxonomyCreate schema."""
        data = {
            "name": TEST_TAXONOMY,
            "version": VERSION_V1,
            "description": "A test taxonomy",
            "domains": {"materials"},
            "source": "https://example.com",
        }
        schema = TaxonomyCreate(**data)

        assert schema.name == TEST_TAXONOMY
        assert schema.version == VERSION_V1
        assert schema.domains == {TaxonomyDomain.MATERIALS}

    def test_taxonomy_create_name_too_short(self) -> None:
        """Test TaxonomyCreate rejects name that's too short."""
        with pytest.raises(ValidationError) as exc_info:
            TaxonomyCreate(
                name="A",  # Too short
                version=VERSION_V1,
                domains={"materials"},
            )

        errors = exc_info.value.errors()
        assert any(e["loc"][0] == LOC_NAME for e in errors)

    def test_taxonomy_create_multiple_domains(self) -> None:
        """Test taxonomy with multiple domains."""
        schema = TaxonomyCreate(
            name="Multi-domain Taxonomy",
            version=VERSION_V1,
            domains={"materials", "products"},
        )

        assert len(schema.domains) == 2
        assert TaxonomyDomain.MATERIALS in schema.domains
        assert TaxonomyDomain.PRODUCTS in schema.domains

    def test_taxonomy_update_partial(self) -> None:
        """Test TaxonomyUpdate with partial data."""
        schema = TaxonomyUpdate(name=UPDATED_NAME, domains={"materials"})

        assert schema.name == UPDATED_NAME
        assert schema.version is None
        assert schema.description is None


@pytest.mark.unit
class TestCategorySchemas:
    """Test Category schema validation."""

    def test_category_create_valid(self) -> None:
        """Test creating valid CategoryCreate schema."""
        schema = CategoryCreate(
            name=TEST_CATEGORY,
            description="A test category",
            taxonomy_id=1,
        )

        assert schema.name == TEST_CATEGORY
        assert schema.taxonomy_id == 1

    def test_category_create_minimal(self) -> None:
        """Test CategoryCreate with only required fields."""
        schema = CategoryCreate(name=MINIMAL_CATEGORY)

        assert schema.name == MINIMAL_CATEGORY
        assert schema.taxonomy_id is None

    def test_category_update_partial(self) -> None:
        """Test CategoryUpdate with partial data."""
        schema = CategoryUpdate(name=UPDATED_CATEGORY)

        assert schema.name == UPDATED_CATEGORY
        assert schema.description is None


@pytest.mark.unit
class TestMaterialSchemas:
    """Test Material schema validation."""

    def test_material_create_valid(self) -> None:
        """Test creating valid MaterialCreate schema."""
        schema = MaterialCreate(
            name=STEEL,
            description="Iron-carbon alloy",
            density_kg_m3=DENSITY_STEEL,
            is_crm=False,
        )

        assert schema.name == STEEL
        assert schema.density_kg_m3 == DENSITY_STEEL
        assert schema.is_crm is False

    def test_material_create_negative_density_fails(self) -> None:
        """Test MaterialCreate rejects negative density."""
        with pytest.raises(ValidationError) as exc_info:
            MaterialCreate(
                name="Invalid Material",
                density_kg_m3=-100.0,
            )

        errors = exc_info.value.errors()
        assert any(e["loc"][0] == LOC_DENSITY for e in errors)

    def test_material_create_zero_density_fails(self) -> None:
        """Test MaterialCreate rejects zero density."""
        with pytest.raises(ValidationError):
            MaterialCreate(
                name="Invalid Material",
                density_kg_m3=0.0,
            )

    def test_material_update_partial(self) -> None:
        """Test MaterialUpdate with partial data."""
        schema = MaterialUpdate(density_kg_m3=DENSITY_UPDATED)

        assert schema.density_kg_m3 == DENSITY_UPDATED
        assert schema.name is None


@pytest.mark.unit
class TestProductTypeSchemas:
    """Test ProductType schema validation."""

    def test_product_type_create_valid(self) -> None:
        """Test creating valid ProductTypeCreate schema."""
        schema = ProductTypeCreate(
            name=ELECTRONICS,
            description=ELECTRONIC_PRODUCTS,
        )

        assert schema.name == ELECTRONICS
        assert schema.description == ELECTRONIC_PRODUCTS

    def test_product_type_create_minimal(self) -> None:
        """Test ProductTypeCreate with only name."""
        schema = ProductTypeCreate(name=MINIMAL)

        assert schema.name == MINIMAL
        assert schema.description is None
