"""Tests for JSON form-field parsing helpers."""

import pytest
from fastapi import HTTPException

from app.api.common.form_json import parse_optional_json_object, parse_required_json_object


def test_parse_optional_json_object_returns_dict() -> None:
    """A valid JSON object should parse to a dict."""
    assert parse_optional_json_object('{"camera": "rpi"}', field_name="image_metadata") == {"camera": "rpi"}


def test_parse_optional_json_object_returns_none_for_missing_value() -> None:
    """Optional JSON form fields may be omitted."""
    assert parse_optional_json_object(None, field_name="image_metadata") is None


def test_parse_required_json_object_rejects_missing_value() -> None:
    """Required JSON form fields must be present."""
    with pytest.raises(HTTPException) as exc_info:
        parse_required_json_object("", field_name="upload_metadata")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "upload_metadata must be a JSON object"


def test_parse_json_object_rejects_malformed_json() -> None:
    """Malformed JSON should return a client error with the field name."""
    with pytest.raises(HTTPException) as exc_info:
        parse_optional_json_object("{", field_name="image_metadata")

    assert exc_info.value.status_code == 400
    assert str(exc_info.value.detail).startswith("image_metadata must be valid JSON")


def test_parse_json_object_rejects_oversized_raw_value() -> None:
    """Metadata form fields should be bounded before JSON parsing."""
    payload = '{"notes":"' + ("a" * (16 * 1024)) + '"}'

    with pytest.raises(HTTPException) as exc_info:
        parse_optional_json_object(payload, field_name="image_metadata")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "image_metadata must be at most 16384 bytes"


@pytest.mark.parametrize("payload", ["[]", '"value"', "1", "true", "null"])
def test_parse_json_object_rejects_non_object_json(payload: str) -> None:
    """Only JSON objects are accepted for metadata form fields."""
    with pytest.raises(HTTPException) as exc_info:
        parse_optional_json_object(payload, field_name="image_metadata")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "image_metadata must be a JSON object"
