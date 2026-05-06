"""Validation helpers for rpi-cam device-supplied metadata."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Annotated, Any, cast

from pydantic import Field, RootModel, ValidationError, field_validator

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

JsonValue = bool | int | float | str | list[Any] | dict[str, Any] | None

MAX_METADATA_KEYS = 32
MAX_METADATA_KEY_LENGTH = 64
MAX_METADATA_STRING_LENGTH = 1024
MAX_METADATA_ITEMS = 32
MAX_METADATA_DEPTH = 4
RpiCamMetadataMap = Annotated[dict[str, JsonValue], Field(max_length=MAX_METADATA_KEYS)]


def validate_rpi_cam_metadata_object(value: dict[str, Any], *, field_name: str) -> dict[str, Any]:
    """Validate parsed rpi-cam metadata before storage or ownership work."""
    try:
        return _RpiCamMetadata.model_validate(value).root
    except ValidationError as exc:
        first_error = exc.errors()[0] if exc.errors() else {"msg": "is invalid"}
        message = str(first_error["msg"]).removeprefix("Value error, ")
        error_message = f"{field_name} {message}"
        raise ValueError(error_message) from exc


class _RpiCamMetadata(RootModel[RpiCamMetadataMap]):
    root: RpiCamMetadataMap

    @field_validator("root")
    @classmethod
    def _validate_metadata(cls, v: dict[str, JsonValue]) -> dict[str, JsonValue]:
        _validate_value(v, depth=0)
        return v


def _validate_value(value: object, *, depth: int) -> None:
    if depth > MAX_METADATA_DEPTH:
        msg = f"may be nested at most {MAX_METADATA_DEPTH} levels"
        raise ValueError(msg)
    if _is_scalar(value):
        return
    if isinstance(value, list):
        _validate_list(value, depth=depth)
        return
    if isinstance(value, dict):
        _validate_dict(cast("Mapping[object, object]", value), depth=depth)
        return
    msg = "values must be JSON-compatible"
    raise ValueError(msg)


def _is_scalar(value: object) -> bool:
    if value is None or isinstance(value, bool | int):
        return True
    if isinstance(value, float):
        if not math.isfinite(value):
            msg = "must contain only finite numbers"
            raise ValueError(msg)
        return True
    if isinstance(value, str):
        if len(value) > MAX_METADATA_STRING_LENGTH:
            msg = f"strings may be at most {MAX_METADATA_STRING_LENGTH} characters"
            raise ValueError(msg)
        return True
    return False


def _validate_list(value: Sequence[object], *, depth: int) -> None:
    if len(value) > MAX_METADATA_ITEMS:
        msg = f"arrays may include at most {MAX_METADATA_ITEMS} items"
        raise ValueError(msg)
    for item in value:
        _validate_value(item, depth=depth + 1)


def _validate_dict(value: Mapping[object, object], *, depth: int) -> None:
    if len(value) > MAX_METADATA_KEYS:
        msg = f"objects may include at most {MAX_METADATA_KEYS} keys"
        raise ValueError(msg)
    for key, item in value.items():
        key_text = str(key)
        if len(key_text) > MAX_METADATA_KEY_LENGTH:
            msg = f"keys may be at most {MAX_METADATA_KEY_LENGTH} characters"
            raise ValueError(msg)
        _validate_value(item, depth=depth + 1)
