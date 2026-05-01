"""Tests for data collection schema validation.

Covers custom validators, computed properties, and business-rule constraints.
Pydantic built-in behavior (required fields, optional defaults, roundtrip) is not tested.
"""
# spell-checker: ignore KALLAX

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from app.api.data_collection.schemas import (
    ProductCreateBaseProduct,
    ProductReadWithRelationships,
    ProductUpdate,
)
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import ImageRead


def _validate_model[T: BaseModel](schema: type[T], data: object) -> T:
    """Validate schema data without unpacking loosely typed dicts."""
    return schema.model_validate(data)


@pytest.mark.parametrize(
    ("schema_cls", "field", "max_len"),
    [
        (ProductCreateBaseProduct, "name", 100),
        (ProductCreateBaseProduct, "description", 500),
        (ProductCreateBaseProduct, "brand", 100),
        (ProductCreateBaseProduct, "model", 100),
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


@pytest.mark.parametrize("field", ["recyclability", "disassemblability", "remanufacturability"])
def test_circularity_property_notes_max_length_enforced(field: str) -> None:
    """Circularity JSON note fields reject inputs that are too long."""
    base = {"name": "Bosch IXO 7 Screwdriver"}

    data_ok = {**base, "circularity_properties": {field: "a" * 500}}
    result = _validate_model(ProductCreateBaseProduct, data_ok)
    assert getattr(result.circularity_properties, field) == "a" * 500

    data_bad = {**base, "circularity_properties": {field: "a" * 501}}
    with pytest.raises(ValidationError):
        _validate_model(ProductCreateBaseProduct, data_bad)


def test_circularity_properties_reject_unknown_nested_keys() -> None:
    """Circularity JSON API shape is restricted to the supported note fields."""
    with pytest.raises(ValidationError):
        _validate_model(
            ProductCreateBaseProduct,
            {
                "name": "Bosch IXO 7 Screwdriver",
                "circularity_properties": {"repairability": "old field name"},
            },
        )


def test_circularity_properties_trim_strings() -> None:
    """Circularity note strings are stripped consistently with other input strings."""
    product = _validate_model(
        ProductCreateBaseProduct,
        {
            "name": "Bosch IXO 7 Screwdriver",
            "circularity_properties": {"recyclability": "  easy to sort  "},
        },
    )

    assert product.circularity_properties is not None
    assert product.circularity_properties.recyclability == "easy to sort"


@pytest.mark.parametrize(
    "value",
    [
        {},
        {"recyclability": None, "disassemblability": None, "remanufacturability": None},
        {"recyclability": "", "disassemblability": "  ", "remanufacturability": None},
    ],
)
def test_empty_circularity_properties_normalize_to_none(value: object) -> None:
    """Empty circularity JSON payloads are canonicalized to null."""
    product = _validate_model(
        ProductCreateBaseProduct,
        {"name": "Bosch IXO 7 Screwdriver", "circularity_properties": value},
    )

    assert product.circularity_properties is None


def test_product_name_min_length() -> None:
    """Product name must be at least 2 characters."""
    with pytest.raises(ValidationError):
        _validate_model(ProductCreateBaseProduct, {"name": "A"})


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


def test_product_create_normalizes_user_text_to_nfc() -> None:
    """Product create text fields are normalized before persistence."""
    product = _validate_model(ProductCreateBaseProduct, {"name": "Cafe\u0301 grinder"})

    assert product.name == "Café grinder"


def test_product_update_rejects_hidden_control_characters() -> None:
    """Product update text fields reject invisible control characters."""
    with pytest.raises(ValidationError):
        _validate_model(ProductUpdate, {"description": "looks normal\u0000but is not"})


def test_circularity_note_allows_multiline_text() -> None:
    """Circularity notes are free-form text and may contain line breaks."""
    product = _validate_model(
        ProductCreateBaseProduct,
        {
            "name": "Cordless Drill",
            "circularity_properties": {"recyclability": "Step 1\nStep 2"},
        },
    )

    assert product.circularity_properties is not None
    assert product.circularity_properties.recyclability == "Step 1\nStep 2"


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
            "images": [],
        },
    )

    assert product.thumbnail_url is None
