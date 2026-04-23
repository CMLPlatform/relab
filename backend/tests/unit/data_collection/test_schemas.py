"""Tests for data collection schema validation.

Covers custom validators, computed properties, and business-rule constraints.
Pydantic built-in behavior (required fields, optional defaults, roundtrip) is not tested.
"""
# spell-checker: ignore KALLAX

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from app.api.data_collection.schemas import (
    ProductCreateBaseProduct,
    ProductReadWithRelationships,
    ValidDateTime,
    ensure_timezone,
    not_too_old,
)
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import ImageRead


def _validate_model[T: BaseModel](schema: type[T], data: object) -> T:
    """Validate schema data without unpacking loosely typed dicts."""
    return schema.model_validate(data)


class TestValidatorsCommon:
    """Tests for custom validators used across schemas."""

    def test_ensure_timezone_with_aware_datetime(self) -> None:
        """Verify ensure_timezone accepts timezone-aware datetime."""
        dt = datetime.now(UTC)
        result = ensure_timezone(dt)
        assert result == dt
        assert result.tzinfo is not None

    def test_ensure_timezone_rejects_naive_datetime(self) -> None:
        """Verify ensure_timezone rejects naive datetime."""
        dt = datetime.now(UTC).replace(tzinfo=None)
        with pytest.raises(ValueError, match="timezone"):
            ensure_timezone(dt)

    def test_not_too_old_recent_datetime(self) -> None:
        """Verify not_too_old accepts recent datetime."""
        dt = datetime.now(UTC) - timedelta(days=30)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_rejects_old_datetime(self) -> None:
        """Verify not_too_old rejects datetime older than 365 days."""
        dt = datetime.now(UTC) - timedelta(days=366)
        with pytest.raises(ValueError, match="365"):
            not_too_old(dt)

    def test_not_too_old_accepts_boundary_date(self) -> None:
        """Verify not_too_old accepts datetime within 365 days."""
        dt = datetime.now(UTC) - timedelta(days=364)
        result = not_too_old(dt)
        assert result == dt

    def test_not_too_old_with_custom_delta(self) -> None:
        """Verify not_too_old respects custom time delta."""
        old_dt = datetime.now(UTC) - timedelta(days=61)
        with pytest.raises(ValueError, match="in past"):
            not_too_old(old_dt, time_delta=timedelta(days=30))


@pytest.mark.parametrize(
    ("schema_cls", "field", "max_len"),
    [
        (ProductCreateBaseProduct, "name", 100),
        (ProductCreateBaseProduct, "description", 500),
        (ProductCreateBaseProduct, "brand", 100),
        (ProductCreateBaseProduct, "model", 100),
        (ProductCreateBaseProduct, "dismantling_notes", 500),
        (ProductCreateBaseProduct, "recyclability_observation", 500),
        (ProductCreateBaseProduct, "recyclability_comment", 100),
    ],
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_field_max_length_enforced(schema_cls: type[BaseModel], field: str, max_len: int) -> None:
    """Business-rule max-length constraints reject inputs that are too long."""
    base = {"name": "Bosch IXO 7 Screwdriver"}
    # Exactly at limit should pass
    data_ok = {**base, field: "a" * max_len}
    result = _validate_model(schema_cls, data_ok)
    assert len(getattr(result, field)) == max_len

    # One over should fail
    data_bad = {**base, field: "a" * (max_len + 1)}
    with pytest.raises(ValidationError):
        _validate_model(schema_cls, data_bad)


def test_product_name_min_length() -> None:
    """Product name must be at least 2 characters."""
    with pytest.raises(ValidationError):
        _validate_model(ProductCreateBaseProduct, {"name": "A"})


class TestProductTimeValidation:
    """Tests for dismantling time custom validators."""

    def test_dismantling_time_start_must_be_in_past(self) -> None:
        """Verify dismantling_time_start rejects future datetimes."""
        future = datetime.now(UTC) + timedelta(days=1)
        with pytest.raises(ValidationError):
            _validate_model(ProductCreateBaseProduct, {"name": "IKEA KALLAX Shelf", "dismantling_time_start": future})

    def test_dismantling_time_end_must_be_after_start(self) -> None:
        """Verify dismantling_time_end must be after dismantling_time_start."""
        start = datetime.now(UTC) - timedelta(hours=2)
        end = start - timedelta(hours=1)
        with pytest.raises(ValidationError):
            _validate_model(
                ProductCreateBaseProduct,
                {"name": "IKEA KALLAX Shelf", "dismantling_time_start": start, "dismantling_time_end": end},
            )


def test_product_list_fields_default_to_empty() -> None:
    """Videos and bill_of_materials default to empty lists."""
    product = _validate_model(ProductCreateBaseProduct, {"name": "Dyson V15 Detect"})
    assert product.videos == []
    assert product.bill_of_materials == []


def test_product_brand_lowercased() -> None:
    """Brand field is normalized to lowercase."""
    product = _validate_model(
        ProductCreateBaseProduct,
        {"name": "Cordless Drill", "brand": "Bosch"},
    )
    assert product.brand == "bosch"


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
        dt = datetime.now(UTC).replace(tzinfo=None)

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


def test_product_read_thumbnail_url_with_images() -> None:
    """Thumbnail URL is computed from the first image."""
    image1 = _validate_model(
        ImageRead,
        {
            "id": uuid4(),
            "filename": "front-panel.png",
            "image_url": "/uploads/images/front-panel.png",
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
            "filename": "pcb-detail.png",
            "image_url": "/uploads/images/pcb-detail.png",
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
            "name": "Bosch PSB 1800 LI-2",
            "owner_id": uuid4(),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "dismantling_time_start": datetime.now(UTC),
            "images": [image1, image2],
        },
    )

    assert product.thumbnail_url == "/uploads/images/front-panel.png"


def test_product_read_thumbnail_url_without_images() -> None:
    """Thumbnail URL is None when no images are present."""
    product = _validate_model(
        ProductReadWithRelationships,
        {
            "id": 1,
            "name": "Bosch PSB 1800 LI-2",
            "owner_id": uuid4(),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "dismantling_time_start": datetime.now(UTC),
            "images": [],
        },
    )

    assert product.thumbnail_url is None
