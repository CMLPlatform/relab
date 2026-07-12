"""Tests for rpi-cam device-supplied metadata bounds."""

from typing import TYPE_CHECKING

import pytest

from app.api.plugins.rpi_cam.utils.metadata import (
    MAX_METADATA_DEPTH,
    MAX_METADATA_ITEMS,
    MAX_METADATA_KEY_LENGTH,
    MAX_METADATA_KEYS,
    MAX_METADATA_STRING_LENGTH,
    validate_rpi_cam_metadata_object,
)

if TYPE_CHECKING:
    from typing import Any


def test_accepts_nested_json_within_limits() -> None:
    """Ordinary device metadata passes through unchanged."""
    value: dict[str, Any] = {"iso": 100, "ok": True, "tags": ["a", "b"], "lens": {"f": 2.8}, "note": None}

    assert validate_rpi_cam_metadata_object(value, field_name="metadata") == value


def test_error_message_is_prefixed_with_field_name() -> None:
    """Validation errors name the offending field for the API response."""
    with pytest.raises(ValueError, match=r"^metadata "):
        validate_rpi_cam_metadata_object({"a": float("nan")}, field_name="metadata")


def _nested(depth: int) -> dict[str, Any]:
    value: dict[str, Any] = {"leaf": 1}
    for _ in range(depth):
        value = {"n": value}
    return value


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (_nested(MAX_METADATA_DEPTH + 1), "nested at most"),
        ({"a": float("inf")}, "finite numbers"),
        ({"a": float("nan")}, "finite numbers"),
        ({"a": "x" * (MAX_METADATA_STRING_LENGTH + 1)}, "at most"),
        ({"a": list(range(MAX_METADATA_ITEMS + 1))}, "at most"),
        ({"k" * (MAX_METADATA_KEY_LENGTH + 1): 1}, "at most"),
        ({f"k{i}": 1 for i in range(MAX_METADATA_KEYS + 1)}, "at most"),
        ({"a": {"b": object()}}, "JSON-compatible"),
    ],
)
def test_rejects_out_of_bounds_metadata(value: dict[str, Any], message: str) -> None:
    """Device-supplied metadata must stay within the storage and parsing bounds."""
    with pytest.raises(ValueError, match=message):
        validate_rpi_cam_metadata_object(value, field_name="metadata")
