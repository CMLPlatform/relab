"""Reusable router query parameter helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Query

if TYPE_CHECKING:
    from typing import Any


def relationship_include_query(*, openapi_examples: dict[str, Any]) -> object:
    """Build a reusable relationship include query parameter."""
    return Query(
        description="Relationships to include",
        openapi_examples=openapi_examples,
    )


def boolean_flag_query(*, description: str) -> object:
    """Build a reusable boolean query flag definition."""
    return Query(description=description)
