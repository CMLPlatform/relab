"""Tests for data collection schema validation.

Tests validate Pydantic schemas for creating, reading, and updating products,
physical properties, and circularity properties using ProductCreateBaseProduct
and related schemas.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.data_collection.schemas import (
    CircularityPropertiesCreate,
    CircularityPropertiesRead,
    CircularityPropertiesUpdate,
    PhysicalPropertiesCreate,
    PhysicalPropertiesRead,
    PhysicalPropertiesUpdate,
    ProductCreateBaseProduct,
    ValidDateTime,
    ensure_timezone,
    not_too_old,
)


@pytest.mark.unit
class TestValidatorsCommon:
    """Tests for common validators used across schemas."""

    def test_ensure_timezone_with_aware_datetime(self):
        """Verify ensure_timezone accepts timezone-aware datetime."""
        dt = datetime.now(UTC)
        result = ensure_timezone(dt)
        assert result == dt
        assert result.tzinfo is not None

    def test_ensure_timezone_rejects_naive_datetime(self):
        """Verify ensure_timezone rejects naive datetime."""
        dt = datetime.now()  # No timezone
        with pytest.raises(ValueError) as exc_info:
            ensure_timezone(dt)
        assert "timezone" in str(exc_info.value).lower()

    def test_not_too_old_recent_datetime(self):
        """Verify not_too_old accepts recent datetime."""
        dt = datetime.now(UTC) - timedelta(days=30)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_rejects_old_datetime(self):
        """Verify not_too_old rejects datetime older than 365 days."""
        dt = datetime.now(UTC) - timedelta(days=366)
        with pytest.raises(ValueError) as exc_info:
            not_too_old(dt)
        assert "365" in str(exc_info.value) or "days" in str(exc_info.value).lower()

    def test_not_too_old_accepts_boundary_date(self):
        """Verify not_too_old accepts datetime within 365 days."""
        # Use a date 364 days in the past (safely within boundary)
        dt = datetime.now(UTC) - timedelta(days=364)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_with_custom_delta(self):
        """Verify not_too_old respects custom time delta."""
        custom_delta = timedelta(days=30)
        old_dt = datetime.now(UTC) - timedelta(days=61)
        with pytest.raises(ValueError):
            not_too_old(old_dt, time_delta=custom_delta)


@pytest.mark.unit
class TestPhysicalPropertiesCreate:
    """Tests for PhysicalPropertiesCreate schema."""

    def test_create_with_all_fields(self):
        """Verify creating physical properties with all fields."""
        data = {
            "weight_g": 20000.0,
            "height_cm": 150.0,
            "width_cm": 70.0,
            "depth_cm": 50.0,
        }
        props = PhysicalPropertiesCreate(**data)

        assert props.weight_g == 20000.0
        assert props.height_cm == 150.0
        assert props.width_cm == 70.0
        assert props.depth_cm == 50.0

    def test_create_with_partial_fields(self):
        """Verify creating physical properties with only some fields."""
        data = {"weight_g": 5000.0}
        props = PhysicalPropertiesCreate(**data)

        assert props.weight_g == 5000.0
        assert props.height_cm is None

    def test_create_with_no_fields(self):
        """Verify creating physical properties with no fields."""
        props = PhysicalPropertiesCreate()

        assert props.weight_g is None
        assert props.height_cm is None

    def test_weight_must_be_positive(self):
        """Verify weight must be positive."""
        data = {"weight_g": -1000.0}
        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(**data)

    def test_height_must_be_positive(self):
        """Verify height must be positive."""
        data = {"height_cm": 0.0}
        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(**data)

    def test_width_must_be_positive(self):
        """Verify width must be positive."""
        data = {"width_cm": -100.0}
        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(**data)

    def test_depth_must_be_positive(self):
        """Verify depth must be positive."""
        data = {"depth_cm": -50.0}
        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(**data)

    def test_fractional_dimensions(self):
        """Verify fractional dimensions are accepted."""
        data = {
            "height_cm": 10.5,
            "width_cm": 20.75,
            "depth_cm": 5.25,
        }
        props = PhysicalPropertiesCreate(**data)

        assert props.height_cm == 10.5
        assert props.width_cm == 20.75


@pytest.mark.unit
class TestPhysicalPropertiesRead:
    """Tests for PhysicalPropertiesRead schema."""

    def test_read_with_all_fields(self):
        """Verify read schema accepts all fields with id."""
        data = {
            "id": 1,
            "weight_g": 20000.0,
            "height_cm": 150.0,
            "width_cm": 70.0,
            "depth_cm": 50.0,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        props = PhysicalPropertiesRead(**data)

        assert props.id == 1
        assert props.weight_g == 20000.0

    def test_read_requires_id(self):
        """Verify read schema requires id field."""
        data = {
            "weight_g": 20000.0,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        with pytest.raises(ValidationError):
            PhysicalPropertiesRead(**data)


@pytest.mark.unit
class TestPhysicalPropertiesUpdate:
    """Tests for PhysicalPropertiesUpdate schema."""

    def test_update_single_field(self):
        """Verify updating single field."""
        data = {"weight_g": 15000.0}
        props = PhysicalPropertiesUpdate(**data)

        assert props.weight_g == 15000.0
        assert props.height_cm is None

    def test_update_multiple_fields(self):
        """Verify updating multiple fields."""
        data = {
            "weight_g": 15000.0,
            "height_cm": 120.0,
        }
        props = PhysicalPropertiesUpdate(**data)

        assert props.weight_g == 15000.0
        assert props.height_cm == 120.0

    def test_update_no_fields(self):
        """Verify updating with no fields is allowed."""
        props = PhysicalPropertiesUpdate()

        assert props.weight_g is None


@pytest.mark.unit
class TestCircularityPropertiesCreate:
    """Tests for CircularityPropertiesCreate schema."""

    def test_create_with_all_fields(self):
        """Verify creating circularity properties with all fields."""
        data = {
            "recyclability_observation": "Can be recycled",
            "recyclability_comment": "Recyclable",
            "recyclability_reference": "ISO 14040",
            "repairability_observation": "Can be repaired",
            "repairability_comment": "Repairable",
            "repairability_reference": "ISO 20887",
            "remanufacturability_observation": "Can be remanufactured",
            "remanufacturability_comment": "Remanufacturable",
            "remanufacturability_reference": "UNEP 2018",
        }
        props = CircularityPropertiesCreate(**data)

        assert props.recyclability_observation == "Can be recycled"
        assert props.repairability_comment == "Repairable"

    def test_create_with_no_fields(self):
        """Verify creating circularity properties with no fields."""
        props = CircularityPropertiesCreate()

        assert props.recyclability_observation is None
        assert props.repairability_comment is None

    def test_observation_max_length_500(self):
        """Verify observation fields max length is 500."""
        long_text = "a" * 501
        data = {"recyclability_observation": long_text}

        with pytest.raises(ValidationError):
            CircularityPropertiesCreate(**data)

    def test_comment_max_length_100(self):
        """Verify comment fields max length is 100."""
        long_text = "a" * 101
        data = {"recyclability_comment": long_text}

        with pytest.raises(ValidationError):
            CircularityPropertiesCreate(**data)

    def test_observation_exact_max_length(self):
        """Verify exactly at max length is accepted."""
        text_500 = "a" * 500
        data = {"recyclability_observation": text_500}
        props = CircularityPropertiesCreate(**data)

        assert len(props.recyclability_observation) == 500


@pytest.mark.unit
class TestCircularityPropertiesRead:
    """Tests for CircularityPropertiesRead schema."""

    def test_read_with_all_fields(self):
        """Verify read schema accepts all fields."""
        data = {
            "id": 1,
            "recyclability_observation": "Recyclable",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        props = CircularityPropertiesRead(**data)

        assert props.id == 1
        assert props.recyclability_observation == "Recyclable"


@pytest.mark.unit
class TestCircularityPropertiesUpdate:
    """Tests for CircularityPropertiesUpdate schema."""

    def test_update_single_field(self):
        """Verify updating single field."""
        data = {"recyclability_observation": "Updated"}
        props = CircularityPropertiesUpdate(**data)

        assert props.recyclability_observation == "Updated"

    def test_update_no_fields(self):
        """Verify updating with no fields is allowed."""
        props = CircularityPropertiesUpdate()

        assert props.recyclability_observation is None


@pytest.mark.unit
class TestProductCreateBaseProductSchema:
    """Tests for ProductCreateBaseProduct schema."""

    def test_create_with_required_fields(self):
        """Verify creating product with required fields."""
        data = {"name": "Test Product"}
        product = ProductCreateBaseProduct(**data)

        assert product.name == "Test Product"

    def test_name_min_length_2(self):
        """Verify product name must be at least 2 characters."""
        data = {"name": "A"}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_name_max_length_100(self):
        """Verify product name max length is 100."""
        long_name = "a" * 101
        data = {"name": long_name}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_create_with_optional_fields(self):
        """Verify creating product with optional fields."""
        data = {
            "name": "Test Product",
            "description": "A test product",
            "brand": "TestBrand",
            "model": "Model X",
        }
        product = ProductCreateBaseProduct(**data)

        assert product.description == "A test product"
        assert product.brand == "TestBrand"

    def test_description_max_length(self):
        """Verify description max length is 500."""
        long_desc = "a" * 501
        data = {"name": "Test", "description": long_desc}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_brand_max_length(self):
        """Verify brand max length is 100."""
        long_brand = "a" * 101
        data = {"name": "Test", "brand": long_brand}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_model_max_length(self):
        """Verify model max length is 100."""
        long_model = "a" * 101
        data = {"name": "Test", "model": long_model}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_dismantling_notes_max_length(self):
        """Verify dismantling notes max length is 500."""
        long_notes = "a" * 501
        data = {"name": "Test", "dismantling_notes": long_notes}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_dismantling_time_start_validation(self):
        """Verify dismantling_time_start must be in past."""
        future_time = datetime.now(UTC) + timedelta(days=1)
        data = {"name": "Test", "dismantling_time_start": future_time}
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_dismantling_time_end_after_start(self):
        """Verify dismantling_time_end must be after dismantling_time_start."""
        start_time = datetime.now(UTC) - timedelta(hours=2)
        end_time = start_time - timedelta(hours=1)
        data = {
            "name": "Test",
            "dismantling_time_start": start_time,
            "dismantling_time_end": end_time,
        }
        with pytest.raises(ValidationError):
            ProductCreateBaseProduct(**data)

    def test_name_with_special_characters(self):
        """Verify product name accepts special characters."""
        data = {"name": "Test-Product_#1 (v2.0)"}
        product = ProductCreateBaseProduct(**data)

        assert product.name == "Test-Product_#1 (v2.0)"

    def test_name_with_unicode(self):
        """Verify product name accepts unicode characters."""
        data = {"name": "产品名称 Product 製品"}
        product = ProductCreateBaseProduct(**data)

        assert "产品" in product.name

    def test_create_with_physical_properties(self):
        """Verify creating product with physical properties."""
        data = {
            "name": "Product with Props",
            "physical_properties": {
                "weight_g": 5000.0,
                "height_cm": 100.0,
            },
        }
        product = ProductCreateBaseProduct(**data)

        assert product.physical_properties is not None
        assert product.physical_properties.weight_g == 5000.0

    def test_create_with_circularity_properties(self):
        """Verify creating product with circularity properties."""
        data = {
            "name": "Product",
            "circularity_properties": {
                "recyclability_observation": "Highly recyclable",
            },
        }
        product = ProductCreateBaseProduct(**data)

        assert product.circularity_properties is not None
        assert "recyclable" in product.circularity_properties.recyclability_observation.lower()

    def test_create_with_product_type(self):
        """Verify creating product with product_type_id."""
        data = {
            "name": "Product",
            "product_type_id": 123,
        }
        product = ProductCreateBaseProduct(**data)

        assert product.product_type_id == 123

    def test_videos_default_to_empty_list(self):
        """Verify videos default to empty list."""
        data = {"name": "Product"}
        product = ProductCreateBaseProduct(**data)

        assert product.videos == []

    def test_bill_of_materials_default_to_empty_list(self):
        """Verify bill_of_materials default to empty list."""
        data = {"name": "Product"}
        product = ProductCreateBaseProduct(**data)

        assert product.bill_of_materials == []


@pytest.mark.unit
class TestValidDatetimeType:
    """Tests for ValidDateTime custom type."""

    def test_valid_recent_past_datetime(self):
        """Verify ValidDateTime accepts recent past datetime."""
        dt = datetime.now(UTC) - timedelta(days=30)
        from pydantic import BaseModel

        class TestModel(BaseModel):
            event_time: ValidDateTime

        model = TestModel(event_time=dt)
        assert model.event_time == dt

    def test_valid_datetime_rejects_future(self):
        """Verify ValidDateTime rejects future datetime."""
        dt = datetime.now(UTC) + timedelta(hours=1)
        from pydantic import BaseModel

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)

    def test_valid_datetime_requires_timezone(self):
        """Verify ValidDateTime requires timezone-aware datetime."""
        dt = datetime.now()  # Naive datetime
        from pydantic import BaseModel

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)

    def test_valid_datetime_rejects_too_old(self):
        """Verify ValidDateTime rejects datetime older than 365 days."""
        dt = datetime.now(UTC) - timedelta(days=400)
        from pydantic import BaseModel

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)


@pytest.mark.unit
class TestSchemaEdgeCases:
    """Tests for schema edge cases and boundary conditions."""

    def test_zero_weight_rejected(self):
        """Verify zero weight is rejected."""
        data = {"weight_g": 0.0}
        with pytest.raises(ValidationError):
            PhysicalPropertiesCreate(**data)

    def test_negative_dimensions_rejected(self):
        """Verify negative dimensions are rejected."""
        for field in ["height_cm", "width_cm", "depth_cm"]:
            data = {field: -10.0}
            with pytest.raises(ValidationError):
                PhysicalPropertiesCreate(**data)

    def test_large_weight_values(self):
        """Verify large weight values are accepted."""
        data = {"weight_g": 1000000.0}  # 1 mega-gram
        props = PhysicalPropertiesCreate(**data)
        assert props.weight_g == 1000000.0

    def test_large_dimension_values(self):
        """Verify large dimension values are accepted."""
        data = {
            "height_cm": 100000.0,
            "width_cm": 50000.0,
            "depth_cm": 25000.0,
        }
        props = PhysicalPropertiesCreate(**data)
        assert props.height_cm == 100000.0

    def test_mixed_optional_required_fields(self):
        """Verify mixing optional and required fields."""
        data = {
            "name": "Product",
            "description": None,
            "brand": "BrandName",
            "model": None,
        }
        product = ProductCreateBaseProduct(**data)

        assert product.brand == "BrandName"
        assert product.model is None
