"""Validation tests for product schemas.

Focuses on Pydantic input validation for API schemas.
"""

import pytest
from datetime import UTC, datetime, timedelta
from pydantic import ValidationError

from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    PhysicalPropertiesCreate,
    ProductCreateBaseProduct,
)


class TestPhysicalPropertiesSchemaValidation:
    """Test validation for PhysicalProperties schemas."""

    def test_positive_value_constraints(self) -> None:
        """Test that physical properties require positive values."""
        # Weight must be positive
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(weight_kg=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(height_cm=-10.0)

        # Valid values
        props = PhysicalPropertiesCreate(weight_kg=20.5, height_cm=150.0)
        assert props.weight_kg == 20.5


class TestProductSchemaDatetimeValidation:
    """Test datetime validation in product schemas."""

    def test_datetime_must_be_timezone_aware(self) -> None:
        """Test that dismantling times must be timezone-aware."""
        # Naive datetime (no timezone)
        naive_dt = datetime(2025, 1, 1, 12, 0, 0)

        with pytest.raises(ValidationError, match="timezone"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=naive_dt)

    def test_datetime_must_be_in_past(self) -> None:
        """Test that dismantling times must be in the past."""
        future_dt = datetime.now(UTC) + timedelta(days=1)

        with pytest.raises(ValidationError, match="past"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=future_dt)

    def test_datetime_cannot_be_too_old(self) -> None:
        """Test that dismantling times cannot be more than 365 days old."""
        too_old = datetime.now(UTC) - timedelta(days=366)

        with pytest.raises(ValidationError, match="cannot be more than.*days in past"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=too_old)

    def test_valid_past_datetime(self) -> None:
        """Test that valid past times are accepted."""
        valid_dt = datetime.now(UTC) - timedelta(days=30)

        product = ProductCreateBaseProduct(name="Test", dismantling_time_start=valid_dt)
        assert product.dismantling_time_start == valid_dt


class TestProductSchemaFieldValidation:
    """Test field-level validation in product schemas."""

    def test_name_length_constraints(self) -> None:
        """Test product name length validation."""
        with pytest.raises(ValidationError, match="at least 2 characters"):
            ProductCreateBaseProduct(name="A")

        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductCreateBaseProduct(name="A" * 101)

        product = ProductCreateBaseProduct(name="AB")
        assert product.name == "AB"

    def test_string_field_max_lengths(self) -> None:
        """Test max length constraints for string fields."""
        with pytest.raises(ValidationError, match="at most 500 characters"):
            ProductCreateBaseProduct(name="Test", description="A" * 501)

        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductCreateBaseProduct(name="Test", brand="A" * 101)


class TestComponentSchemaValidation:
    """Test validation for component schemas."""

    def test_amount_in_parent_must_be_positive(self) -> None:
        """Test that amount_in_parent must be greater than 0."""
        with pytest.raises(ValidationError, match="greater than 0"):
            ComponentCreateWithComponents(name="Component", amount_in_parent=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            ComponentCreateWithComponents(name="Component", amount_in_parent=-1)

    def test_component_must_have_materials_or_subcomponents(self) -> None:
        """Test that a component must have either materials or sub-components."""
        # No materials, no components - should fail
        with pytest.raises(ValidationError, match="at least one material or component"):
            ComponentCreateWithComponents(
                name="Empty Component", amount_in_parent=1, bill_of_materials=[], components=[]
            )

        # With materials - should succeed
        component = ComponentCreateWithComponents(
            name="Component with materials",
            amount_in_parent=1,
            bill_of_materials=[{"material_id": 1, "quantity": 0.5, "unit": "kg"}],
        )
        assert len(component.bill_of_materials) == 1


class TestProductTypeValidation:
    """Test product_type_id validation."""

    def test_product_type_id_must_be_positive(self) -> None:
        """Test that product_type_id must be positive if provided."""
        with pytest.raises(ValidationError, match="greater than 0"):
            ProductCreateBaseProduct(name="Test", product_type_id=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            ProductCreateBaseProduct(name="Test", product_type_id=-1)

        # None is valid
        product = ProductCreateBaseProduct(name="Test", product_type_id=None)
        assert product.product_type_id is None
