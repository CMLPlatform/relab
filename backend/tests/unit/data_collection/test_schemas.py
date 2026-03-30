"""Tests for data collection schema validation.

Tests validate Pydantic schemas for creating, reading, and updating products,
physical properties, and circularity properties using ProductCreateBaseProduct
and related schemas.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from app.api.data_collection.schemas import (
    CircularityPropertiesCreate,
    CircularityPropertiesRead,
    CircularityPropertiesUpdate,
    PhysicalPropertiesCreate,
    PhysicalPropertiesRead,
    PhysicalPropertiesUpdate,
    ProductCreateBaseProduct,
    ProductReadWithRelationships,
    ValidDateTime,
    ensure_timezone,
    not_too_old,
)
from app.api.file_storage.models.models import MediaParentType
from app.api.file_storage.schemas import ImageRead

# Constants for test values to avoid magic value warnings
WEIGHT_20KG = 20000.0
WEIGHT_15KG = 15000.0
WEIGHT_5KG = 5000.0
WEIGHT_1MG = 1000000.0
HEIGHT_150CM = 150.0
HEIGHT_120CM = 120.0
HEIGHT_100CM = 100.0
HEIGHT_1KM = 100000.0
HEIGHT_FRAC = 10.5
WIDTH_70CM = 70.0
WIDTH_50CM = 50.0
WIDTH_FRAC = 20.75
DEPTH_50CM = 50.0
OBS_RECYCLABLE_MSG = "Can be recycled"
COMM_RECYCLABLE = "Recyclable"
COMM_REPAIRABLE = "Repairable"
REMAN_MSG = "Can be remanufactured"
REMAN_COMM = "Remanufacturable"
TEST_PRODUCT_NAME = "Test Product"
TEST_PRODUCT_DESC = "A test product"
TEST_BRAND = "TestBrand"
BRAND_NAME = "BrandName"
MODEL_X = "Model X"
SPECIAL_NAME = "Test-Product_#1 (v2.0)"
UNICODE_NAME = "产品名称 Product 製品"
UPDATED_OBS = "Updated"
RECYCLABLE_KEYWORD = "recyclable"
UNICODE_SEARCH = "产品"
TZ_MSG = "timezone"
DAYS_365 = "365"


def _validate_model[T: BaseModel](schema: type[T], data: object) -> T:
    """Validate schema data without unpacking loosely typed dicts."""
    return schema.model_validate(data)


@pytest.mark.unit
class TestValidatorsCommon:
    """Tests for common validators used across schemas."""

    def test_ensure_timezone_with_aware_datetime(self) -> None:
        """Verify ensure_timezone accepts timezone-aware datetime."""
        dt = datetime.now(UTC)
        result = ensure_timezone(dt)
        assert result == dt
        assert result.tzinfo is not None

    def test_ensure_timezone_rejects_naive_datetime(self) -> None:
        """Verify ensure_timezone rejects naive datetime."""
        dt = datetime.now(UTC).replace(tzinfo=None)  # No timezone
        with pytest.raises(ValueError, match=TZ_MSG):
            ensure_timezone(dt)

    def test_not_too_old_recent_datetime(self) -> None:
        """Verify not_too_old accepts recent datetime."""
        dt = datetime.now(UTC) - timedelta(days=30)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_rejects_old_datetime(self) -> None:
        """Verify not_too_old rejects datetime older than 365 days."""
        dt = datetime.now(UTC) - timedelta(days=366)
        with pytest.raises(ValueError, match=DAYS_365):
            not_too_old(dt)

    def test_not_too_old_accepts_boundary_date(self) -> None:
        """Verify not_too_old accepts datetime within 365 days."""
        # Use a date 364 days in the past (safely within boundary)
        dt = datetime.now(UTC) - timedelta(days=364)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_with_custom_delta(self) -> None:
        """Verify not_too_old respects custom time delta."""
        custom_delta = timedelta(days=30)
        old_dt = datetime.now(UTC) - timedelta(days=61)
        with pytest.raises(ValueError, match="in past"):
            not_too_old(old_dt, time_delta=custom_delta)


@pytest.mark.unit
class TestPhysicalPropertiesCreate:
    """Tests for PhysicalPropertiesCreate schema."""

    def test_create_with_all_fields(self) -> None:
        """Verify creating physical properties with all fields."""
        data = {
            "weight_g": WEIGHT_20KG,
            "height_cm": HEIGHT_150CM,
            "width_cm": WIDTH_70CM,
            "depth_cm": DEPTH_50CM,
        }
        props = _validate_model(PhysicalPropertiesCreate, data)

        assert props.weight_g == WEIGHT_20KG
        assert props.height_cm == HEIGHT_150CM
        assert props.width_cm == WIDTH_70CM
        assert props.depth_cm == DEPTH_50CM

    def test_create_with_partial_fields(self) -> None:
        """Verify creating physical properties with only some fields."""
        data = {"weight_g": WEIGHT_5KG}
        props = _validate_model(PhysicalPropertiesCreate, data)

        assert props.weight_g == WEIGHT_5KG
        assert props.height_cm is None

    def test_create_with_no_fields(self) -> None:
        """Verify creating physical properties with no fields."""
        props = PhysicalPropertiesCreate()

        assert props.weight_g is None
        assert props.height_cm is None

    def test_weight_must_be_positive(self) -> None:
        """Verify weight must be positive."""
        data = {"weight_g": -1000.0}
        with pytest.raises(ValidationError):
            _validate_model(PhysicalPropertiesCreate, data)

    def test_height_must_be_positive(self) -> None:
        """Verify height must be positive."""
        data = {"height_cm": 0.0}
        with pytest.raises(ValidationError):
            _validate_model(PhysicalPropertiesCreate, data)

    def test_width_must_be_positive(self) -> None:
        """Verify width must be positive."""
        data = {"width_cm": -100.0}
        with pytest.raises(ValidationError):
            _validate_model(PhysicalPropertiesCreate, data)

    def test_depth_must_be_positive(self) -> None:
        """Verify depth must be positive."""
        data = {"depth_cm": -50.0}
        with pytest.raises(ValidationError):
            _validate_model(PhysicalPropertiesCreate, data)

    def test_fractional_dimensions(self) -> None:
        """Verify fractional dimensions are accepted."""
        data = {
            "height_cm": HEIGHT_FRAC,
            "width_cm": WIDTH_FRAC,
            "depth_cm": 5.25,
        }
        props = _validate_model(PhysicalPropertiesCreate, data)

        assert props.height_cm == HEIGHT_FRAC
        assert props.width_cm == WIDTH_FRAC


@pytest.mark.unit
class TestPhysicalPropertiesRead:
    """Tests for PhysicalPropertiesRead schema."""

    def test_read_with_all_fields(self) -> None:
        """Verify read schema accepts all fields with id."""
        data = {
            "id": 1,
            "weight_g": WEIGHT_20KG,
            "height_cm": HEIGHT_150CM,
            "width_cm": WIDTH_70CM,
            "depth_cm": DEPTH_50CM,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        props = _validate_model(PhysicalPropertiesRead, data)

        assert props.id == 1
        assert props.weight_g == WEIGHT_20KG

    def test_read_requires_id(self) -> None:
        """Verify read schema requires id field."""
        data = {
            "weight_g": WEIGHT_20KG,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        with pytest.raises(ValidationError):
            _validate_model(PhysicalPropertiesRead, data)


@pytest.mark.unit
class TestPhysicalPropertiesUpdate:
    """Tests for PhysicalPropertiesUpdate schema."""

    def test_update_single_field(self) -> None:
        """Verify updating single field."""
        data = {"weight_g": WEIGHT_15KG}
        props = _validate_model(PhysicalPropertiesUpdate, data)

        assert props.weight_g == WEIGHT_15KG
        assert props.height_cm is None

    def test_update_multiple_fields(self) -> None:
        """Verify updating multiple fields."""
        data = {
            "weight_g": WEIGHT_15KG,
            "height_cm": HEIGHT_120CM,
        }
        props = _validate_model(PhysicalPropertiesUpdate, data)

        assert props.weight_g == WEIGHT_15KG
        assert props.height_cm == HEIGHT_120CM

    def test_update_no_fields(self) -> None:
        """Verify updating with no fields is allowed."""
        props = PhysicalPropertiesUpdate()

        assert props.weight_g is None


@pytest.mark.unit
class TestCircularityPropertiesCreate:
    """Tests for CircularityPropertiesCreate schema."""

    def test_create_with_all_fields(self) -> None:
        """Verify creating circularity properties with all fields."""
        data = {
            "recyclability_observation": OBS_RECYCLABLE_MSG,
            "recyclability_comment": COMM_RECYCLABLE,
            "recyclability_reference": "ISO 14040",
            "repairability_observation": "Can be repaired",
            "repairability_comment": COMM_REPAIRABLE,
            "repairability_reference": "ISO 20887",
            "remanufacturability_observation": REMAN_MSG,
            "remanufacturability_comment": REMAN_COMM,
            "remanufacturability_reference": "UNEP 2018",
        }
        props = _validate_model(CircularityPropertiesCreate, data)

        assert props.recyclability_observation == OBS_RECYCLABLE_MSG
        assert props.repairability_comment == COMM_REPAIRABLE

    def test_create_with_no_fields(self) -> None:
        """Verify creating circularity properties with no fields."""
        props = CircularityPropertiesCreate()

        assert props.recyclability_observation is None
        assert props.repairability_comment is None

    def test_observation_max_length_500(self) -> None:
        """Verify observation fields max length is 500."""
        limit = 500
        long_text = "a" * (limit + 1)
        data = {"recyclability_observation": long_text}

        with pytest.raises(ValidationError):
            _validate_model(CircularityPropertiesCreate, data)

    def test_comment_max_length_100(self) -> None:
        """Verify comment fields max length is 100."""
        limit = 100
        long_text = "a" * (limit + 1)
        data = {"recyclability_comment": long_text}

        with pytest.raises(ValidationError):
            _validate_model(CircularityPropertiesCreate, data)

    def test_observation_exact_max_length(self) -> None:
        """Verify exactly at max length is accepted."""
        limit = 500
        text_500 = "a" * limit
        data = {"recyclability_observation": text_500}
        props = _validate_model(CircularityPropertiesCreate, data)

        assert props.recyclability_observation is not None
        assert len(props.recyclability_observation) == limit


@pytest.mark.unit
class TestCircularityPropertiesRead:
    """Tests for CircularityPropertiesRead schema."""

    def test_read_with_all_fields(self) -> None:
        """Verify read schema accepts all fields."""
        data = {
            "id": 1,
            "recyclability_observation": COMM_RECYCLABLE,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        props = _validate_model(CircularityPropertiesRead, data)

        assert props.id == 1
        assert props.recyclability_observation == COMM_RECYCLABLE


@pytest.mark.unit
class TestCircularityPropertiesUpdate:
    """Tests for CircularityPropertiesUpdate schema."""

    def test_update_single_field(self) -> None:
        """Verify updating single field."""
        data = {"recyclability_observation": UPDATED_OBS}
        props = _validate_model(CircularityPropertiesUpdate, data)

        assert props.recyclability_observation == UPDATED_OBS

    def test_update_no_fields(self) -> None:
        """Verify updating with no fields is allowed."""
        props = CircularityPropertiesUpdate()

        assert props.recyclability_observation is None


@pytest.mark.unit
class TestProductCreateBaseProductSchema:
    """Tests for ProductCreateBaseProduct schema."""

    def test_create_with_required_fields(self) -> None:
        """Verify creating product with required fields."""
        data = {"name": TEST_PRODUCT_NAME}
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.name == TEST_PRODUCT_NAME

    def test_name_min_length_2(self) -> None:
        """Verify product name must be at least 2 characters."""
        data = {"name": "A"}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_name_max_length_100(self) -> None:
        """Verify product name max length is 100."""
        limit = 100
        long_name = "a" * (limit + 1)
        data = {"name": long_name}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_create_with_optional_fields(self) -> None:
        """Verify creating product with optional fields."""
        data = {
            "name": TEST_PRODUCT_NAME,
            "description": TEST_PRODUCT_DESC,
            "brand": TEST_BRAND,
            "model": MODEL_X,
        }
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.description == TEST_PRODUCT_DESC
        assert product.brand == TEST_BRAND.lower()

    def test_description_max_length(self) -> None:
        """Verify description max length is 500."""
        limit = 500
        long_desc = "a" * (limit + 1)
        data = {"name": "Test", "description": long_desc}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_brand_max_length(self) -> None:
        """Verify brand max length is 100."""
        limit = 100
        long_brand = "a" * (limit + 1)
        data = {"name": "Test", "brand": long_brand}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_model_max_length(self) -> None:
        """Verify model max length is 100."""
        limit = 100
        long_model = "a" * (limit + 1)
        data = {"name": "Test", "model": long_model}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_dismantling_notes_max_length(self) -> None:
        """Verify dismantling notes max length is 500."""
        limit = 500
        long_notes = "a" * (limit + 1)
        data = {"name": "Test", "dismantling_notes": long_notes}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_dismantling_time_start_validation(self) -> None:
        """Verify dismantling_time_start must be in past."""
        future_time = datetime.now(UTC) + timedelta(days=1)
        data = {"name": "Test", "dismantling_time_start": future_time}
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_dismantling_time_end_after_start(self) -> None:
        """Verify dismantling_time_end must be after dismantling_time_start."""
        start_time = datetime.now(UTC) - timedelta(hours=2)
        end_time = start_time - timedelta(hours=1)
        data = {
            "name": "Test",
            "dismantling_time_start": start_time,
            "dismantling_time_end": end_time,
        }
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, data)

    def test_name_with_special_characters(self) -> None:
        """Verify product name accepts special characters."""
        data = {"name": SPECIAL_NAME}
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.name == SPECIAL_NAME

    def test_name_with_unicode(self) -> None:
        """Verify product name accepts unicode characters."""
        data = {"name": UNICODE_NAME}
        product = _validate_model(ProductCreateBaseProduct, data)

        assert UNICODE_SEARCH in product.name

    def test_create_with_physical_properties(self) -> None:
        """Verify creating product with physical properties."""
        data = {
            "name": "Product with Props",
            "physical_properties": {
                "weight_g": WEIGHT_5KG,
                "height_cm": HEIGHT_100CM,
            },
        }
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.physical_properties is not None
        assert product.physical_properties.weight_g == WEIGHT_5KG

    def test_create_with_circularity_properties(self) -> None:
        """Verify creating product with circularity properties."""
        data = {
            "name": "Product",
            "circularity_properties": {
                "recyclability_observation": "Highly recyclable",
            },
        }
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.circularity_properties is not None
        assert product.circularity_properties.recyclability_observation is not None
        assert RECYCLABLE_KEYWORD in product.circularity_properties.recyclability_observation.lower()

    def test_create_with_product_type(self) -> None:
        """Verify creating product with product_type_id."""
        item_id = 123
        data = {
            "name": "Product",
            "product_type_id": item_id,
        }
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.product_type_id == item_id

    def test_list_fields_default_to_empty(self) -> None:
        """Verify videos and bill_of_materials default to empty lists."""
        product = _validate_model(ProductCreateBaseProduct, {"name": "Product"})
        assert product.videos == []
        assert product.bill_of_materials == []


@pytest.mark.unit
class TestValidDatetimeType:
    """Tests for ValidDateTime custom type."""

    def test_valid_recent_past_datetime(self) -> None:
        """Verify ValidDateTime accepts recent past datetime."""
        dt = datetime.now(UTC) - timedelta(days=30)

        class TestModel(BaseModel):
            event_time: ValidDateTime

        model = TestModel(event_time=dt)
        assert model.event_time == dt

    def test_valid_datetime_rejects_future(self) -> None:
        """Verify ValidDateTime rejects future datetime."""
        dt = datetime.now(UTC) + timedelta(hours=1)

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)

    def test_valid_datetime_requires_timezone(self) -> None:
        """Verify ValidDateTime requires timezone-aware datetime."""
        dt = datetime.now(UTC).replace(tzinfo=None)  # Naive datetime

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)

    def test_valid_datetime_rejects_too_old(self) -> None:
        """Verify ValidDateTime rejects datetime older than 365 days."""
        dt = datetime.now(UTC) - timedelta(days=400)

        class TestModel(BaseModel):
            event_time: ValidDateTime

        with pytest.raises(ValidationError):
            TestModel(event_time=dt)


@pytest.mark.unit
class TestSchemaEdgeCases:
    """Tests for schema edge cases and boundary conditions."""

    def test_large_weight_values(self) -> None:
        """Verify large weight values are accepted."""
        data = {"weight_g": WEIGHT_1MG}  # 1 mega-gram
        props = _validate_model(PhysicalPropertiesCreate, data)
        assert props.weight_g == WEIGHT_1MG

    def test_large_dimension_values(self) -> None:
        """Verify large dimension values are accepted."""
        data = {
            "height_cm": HEIGHT_1KM,
            "width_cm": 50000.0,
            "depth_cm": 25000.0,
        }
        props = _validate_model(PhysicalPropertiesCreate, data)
        assert props.height_cm == HEIGHT_1KM

    def test_mixed_optional_required_fields(self) -> None:
        """Verify mixing optional and required fields."""
        data = {
            "name": "Product",
            "description": None,
            "brand": BRAND_NAME,
            "model": None,
        }
        product = _validate_model(ProductCreateBaseProduct, data)

        assert product.brand == BRAND_NAME.lower()
        assert product.model is None


def test_product_read_thumbnail_url_with_images() -> None:
    """Test that thumbnail_url is correctly computed from the first image."""
    image1 = _validate_model(
        ImageRead,
        {
            "id": uuid4(),
            "filename": "test1.png",
            "image_url": "/uploads/images/test1.png",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "parent_id": 1,
            "parent_type": MediaParentType.PRODUCT,
        },
    )
    image2 = _validate_model(
        ImageRead,
        {
            "id": uuid4(),
            "filename": "test2.png",
            "image_url": "/uploads/images/test2.png",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "parent_id": 1,
            "parent_type": MediaParentType.PRODUCT,
        },
    )

    product = _validate_model(
        ProductReadWithRelationships,
        {
            "id": 1,
            "name": "Test Product",
            "owner_id": uuid4(),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "dismantling_time_start": datetime.now(UTC),
            "images": [image1, image2],
        },
    )

    assert product.thumbnail_url == "/uploads/images/test1.png"


def test_product_read_thumbnail_url_without_images() -> None:
    """Test that thumbnail_url is None when no images are present."""
    product = _validate_model(
        ProductReadWithRelationships,
        {
            "id": 1,
            "name": "Test Product",
            "owner_id": uuid4(),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "dismantling_time_start": datetime.now(UTC),
            "images": [],
        },
    )

    assert product.thumbnail_url is None
