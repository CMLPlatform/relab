"""Helpers for JSON-encoded multipart form fields."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from fastapi import HTTPException

if TYPE_CHECKING:
    from typing import Any

MAX_FORM_JSON_BYTES = 16 * 1024


def parse_optional_json_object(value: str | None, *, field_name: str) -> dict[str, Any] | None:
    """Parse an optional JSON form field that must contain an object."""
    if value is None:
        return None
    return _parse_json_object(value, field_name=field_name)


def parse_required_json_object(value: str, *, field_name: str) -> dict[str, Any]:
    """Parse a required JSON form field that must contain an object."""
    if not value:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON object")
    return _parse_json_object(value, field_name=field_name)


def _parse_json_object(value: str, *, field_name: str) -> dict[str, Any]:
    if len(value.encode("utf-8")) > MAX_FORM_JSON_BYTES:
        raise HTTPException(status_code=400, detail=f"{field_name} must be at most {MAX_FORM_JSON_BYTES} bytes")

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON object")
    return parsed
