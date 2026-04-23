"""Shared OpenAPI examples used across multiple API domains."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


def openapi_example(
    value: object,
    *,
    summary: str | None = None,
    description: str | None = None,
) -> dict[str, object]:
    """Build a single named OpenAPI example payload."""
    example: dict[str, object] = {"value": value}
    if summary is not None:
        example["summary"] = summary
    if description is not None:
        example["description"] = description
    return example


def openapi_examples(**examples: dict[str, object]) -> dict[str, Example]:
    """Build a typed mapping for FastAPI `openapi_examples=` arguments."""
    return cast("dict[str, Example]", examples)


IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES = openapi_examples(
    nested_metadata=openapi_example(
        r'{"foo_key": "foo_value", "bar_key": {"nested_key": "nested_value"}}',
        summary="Nested metadata JSON string",
    )
)
