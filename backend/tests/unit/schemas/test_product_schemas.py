"""Validation tests for product schemas."""

import pytest
from datetime import UTC, datetime, timedelta
from pydantic import ValidationError

from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    PhysicalPropertiesCreate,
    PhysicalPropertiesUpdate,
    ProductCreateBaseProduct,
    ProductCreateWithComponents,
)


class TestPhysicalPropertiesSchemaValidation:
    """Test validation for PhysicalProperties schemas."""

    def test_create_schema_with_valid_data(self) -> None:
        """Test creating physical properties with valid data."""
        data = {"weight_kg": 20.5, "height_cm": 150.0, "width_cm": 70.0, "depth_cm": 50.0}

        props = PhysicalPropertiesCreate(**data)

        assert props.weight_kg == 20.5
        assert props.height_cm == 150.0

    def test_create_schema_weight_must_be_positive(self) -> None:
        """Test that weight must be greater than 0."""
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(weight_kg=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(weight_kg=-5.0)

    def test_create_schema_height_must_be_positive(self) -> None:
        """Test that height must be greater than 0."""
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(height_cm=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesCreate(height_cm=-10.0)

    def test_update_schema_allows_partial_updates(self) -> None:
        """Test that update schema allows partial field updates."""
        # Update only weight
        props = PhysicalPropertiesUpdate(weight_kg=25.0)
        assert props.weight_kg == 25.0
        assert props.height_cm is None

        # Update only dimensions
        props2 = PhysicalPropertiesUpdate(height_cm=100.0, width_cm=50.0)
        assert props2.height_cm == 100.0
        assert props2.weight_kg is None

    def test_update_schema_validates_positive_values(self) -> None:
        """Test that update schema still validates positive values."""
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesUpdate(weight_kg=-1.0)


class TestProductSchemaTimeValidation:
    """Test datetime validation in product schemas."""

    def test_dismantling_time_must_have_timezone(self) -> None:
        """Test that dismantling time must be timezone-aware."""
        # Naive datetime (no timezone)
        naive_dt = datetime(2025, 1, 1, 12, 0, 0)

        with pytest.raises(ValidationError, match="timezone"):
            ProductCreateBaseProduct(
                name="Test Product", dismantling_time_start=naive_dt, dismantling_time_end=None
            )

    def test_dismantling_time_must_be_in_past(self) -> None:
        """Test that dismantling time must be in the past."""
        # Future datetime
        future_dt = datetime.now(UTC) + timedelta(days=1)

        with pytest.raises(ValidationError, match="past"):
            ProductCreateBaseProduct(
                name="Test Product", dismantling_time_start=future_dt, dismantling_time_end=None
            )

    def test_dismantling_time_not_too_old(self) -> None:
        """Test that dismantling time cannot be more than 365 days in the past."""
        # More than 365 days old
        too_old = datetime.now(UTC) - timedelta(days=366)

        with pytest.raises(ValidationError, match="cannot be more than.*days in past"):
            ProductCreateBaseProduct(name="Test Product", dismantling_time_start=too_old, dismantling_time_end=None)

    def test_dismantling_time_accepts_valid_past_time(self) -> None:
        """Test that valid past times are accepted."""
        # Valid: 30 days ago, with timezone
        valid_dt = datetime.now(UTC) - timedelta(days=30)

        product = ProductCreateBaseProduct(
            name="Test Product", dismantling_time_start=valid_dt, dismantling_time_end=None
        )

        assert product.dismantling_time_start == valid_dt

    def test_dismantling_end_time_validation(self) -> None:
        """Test that end time is also validated."""
        # End time in future
        start_time = datetime.now(UTC) - timedelta(hours=2)
        end_time = datetime.now(UTC) + timedelta(hours=1)

        with pytest.raises(ValidationError, match="past"):
            ProductCreateBaseProduct(
                name="Test Product", dismantling_time_start=start_time, dismantling_time_end=end_time
            )


class TestProductSchemaFieldValidation:
    """Test field-level validation in product schemas."""

    def test_name_length_constraints(self) -> None:
        """Test product name length validation."""
        # Too short
        with pytest.raises(ValidationError, match="at least 2 characters"):
            ProductCreateBaseProduct(name="A")

        # Too long
        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductCreateBaseProduct(name="A" * 101)

        # Valid
        product = ProductCreateBaseProduct(name="AB")
        assert product.name == "AB"

    def test_description_max_length(self) -> None:
        """Test description max length."""
        with pytest.raises(ValidationError, match="at most 500 characters"):
            ProductCreateBaseProduct(name="Test", description="A" * 501)

        # Valid
        product = ProductCreateBaseProduct(name="Test", description="A" * 500)
        assert len(product.description) == 500

    def test_brand_max_length(self) -> None:
        """Test brand max length."""
        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductCreateBaseProduct(name="Test", brand="A" * 101)

    def test_model_field_max_length(self) -> None:
        """Test model field max length."""
        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductCreateBaseProduct(name="Test", model="A" * 101)

    def test_optional_fields_can_be_none(self) -> None:
        """Test that optional fields can be None."""
        product = ProductCreateBaseProduct(
            name="Test Product", description=None, brand=None, model=None, dismantling_notes=None
        )

        assert product.description is None
        assert product.brand is None
        assert product.model is None


class TestComponentSchemaValidation:
    """Test validation for component schemas."""

    def test_amount_in_parent_must_be_positive(self) -> None:
        """Test that amount_in_parent must be greater than 0."""
        with pytest.raises(ValidationError, match="greater than 0"):
            ComponentCreateWithComponents(name="Component", amount_in_parent=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            ComponentCreateWithComponents(name="Component", amount_in_parent=-1)

    def test_amount_in_parent_is_required(self) -> None:
        """Test that amount_in_parent is required for components."""
        with pytest.raises(ValidationError, match="Field required"):
            ComponentCreateWithComponents(name="Component")

    def test_valid_amount_in_parent(self) -> None:
        """Test that valid amount_in_parent is accepted."""
        component = ComponentCreateWithComponents(name="Component", amount_in_parent=5)

        assert component.amount_in_parent == 5


class TestMaterialOrComponentsValidation:
    """Test validation for materials or components requirement."""

    def test_component_must_have_materials_or_subcomponents(self) -> None:
        """Test that a component must have either materials or sub-components."""
        # No materials, no components
        with pytest.raises(ValidationError, match="at least one material or component"):
            ComponentCreateWithComponents(
                name="Empty Component", amount_in_parent=1, bill_of_materials=[], components=[]
            )

    def test_component_with_materials_is_valid(self) -> None:
        """Test that component with materials is valid."""
        component = ComponentCreateWithComponents(
            name="Component with materials",
            amount_in_parent=1,
            bill_of_materials=[{"material_id": 1, "quantity": 0.5, "unit": "kg"}],
            components=[],
        )

        assert len(component.bill_of_materials) == 1

    def test_component_with_subcomponents_is_valid(self) -> None:
        """Test that component with sub-components is valid."""
        component = ComponentCreateWithComponents(
            name="Component with subcomponents",
            amount_in_parent=1,
            bill_of_materials=[],
            components=[
                ComponentCreateWithComponents(
                    name="Subcomponent",
                    amount_in_parent=2,
                    bill_of_materials=[{"material_id": 1, "quantity": 0.1, "unit": "kg"}],
                )
            ],
        )

        assert len(component.components) == 1

    def test_component_with_both_materials_and_components_is_valid(self) -> None:
        """Test that component can have both materials and sub-components."""
        component = ComponentCreateWithComponents(
            name="Complete component",
            amount_in_parent=1,
            bill_of_materials=[{"material_id": 1, "quantity": 0.5, "unit": "kg"}],
            components=[
                ComponentCreateWithComponents(
                    name="Subcomponent",
                    amount_in_parent=1,
                    bill_of_materials=[{"material_id": 2, "quantity": 0.1, "unit": "kg"}],
                )
            ],
        )

        assert len(component.bill_of_materials) == 1
        assert len(component.components) == 1


class TestProductTypeValidation:
    """Test product_type_id validation."""

    def test_product_type_id_must_be_positive(self) -> None:
        """Test that product_type_id must be positive."""
        with pytest.raises(ValidationError, match="greater than 0"):
            ProductCreateBaseProduct(name="Test", product_type_id=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            ProductCreateBaseProduct(name="Test", product_type_id=-1)

    def test_product_type_id_can_be_none(self) -> None:
        """Test that product_type_id can be None."""
        product = ProductCreateBaseProduct(name="Test", product_type_id=None)

        assert product.product_type_id is None

    def test_valid_product_type_id(self) -> None:
        """Test that valid product_type_id is accepted."""
        product = ProductCreateBaseProduct(name="Test", product_type_id=5)

        assert product.product_type_id == 5
