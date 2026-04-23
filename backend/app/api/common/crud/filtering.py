"""Filtering integration boundary for CRUD queries."""
# spell-checker: ignore isouter

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi_filter.contrib.sqlalchemy import Filter
from sqlalchemy import Select

from app.api.common.models.custom_types import MT

if TYPE_CHECKING:
    from typing import Any


def filter_has_values(filter_obj: Filter) -> bool:
    """Return whether a fastapi-filter instance contains any active value."""
    for value in filter_obj.__dict__.values():
        if isinstance(value, Filter):
            if filter_has_values(value):
                return True
        elif value is not None:
            return True
    return False


def apply_relationship_filter_joins(
    statement: Select[tuple[MT]],
    model: type[MT],
    filter_obj: Filter,
    path: list[str] | None = None,
) -> Select[tuple[MT]]:
    """Add joins needed by nested relationship filters.

    fastapi-filter owns the field-level filtering. This helper only bridges its
    nested filter objects into SQLAlchemy joins, keeping the fragile introspection
    in one small module.
    """
    path = path or []
    if not filter_has_values(filter_obj):
        return statement

    relationship_filters = {name: value for name, value in filter_obj.__dict__.items() if isinstance(value, Filter)}
    for rel_name, nested_filter in relationship_filters.items():
        if not filter_has_values(nested_filter):
            continue

        current_model: Any = model
        current_path: list[str] = []
        for ancestor in path:
            current_model = getattr(current_model, ancestor).property.entity.entity
            current_path.append(ancestor)

        relationship = getattr(current_model, rel_name)
        prop = relationship.property
        target = prop.entity.entity

        if getattr(prop, "secondary", None) is not None:
            statement = statement.join(prop.secondary, isouter=bool(current_path)).join(
                target, isouter=bool(current_path)
            )
        else:
            statement = statement.join(target, prop.primaryjoin, isouter=bool(current_path))

        statement = apply_relationship_filter_joins(statement, model, nested_filter, path=[*path, rel_name])

    return statement


def apply_filter(statement: Select[tuple[MT]], model: type[MT], model_filter: Filter | None) -> Select[tuple[MT]]:
    """Apply fastapi-filter filtering, nested joins, and sorting to a select."""
    if model_filter is None:
        return statement

    statement = apply_relationship_filter_joins(statement, model, model_filter)
    statement = model_filter.filter(statement)
    if getattr(model_filter, "order_by", None):
        sort_func = getattr(model_filter, "sort", None)
        if callable(sort_func):
            statement = sort_func(statement)
    return statement
