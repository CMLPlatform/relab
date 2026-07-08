"""Relationship loading helpers for SQLAlchemy CRUD queries."""

from typing import Any, cast

from pydantic import BaseModel
from sqlalchemy import Select, inspect
from sqlalchemy.orm import noload, raiseload, selectinload
from sqlalchemy.orm.attributes import QueryableAttribute

from app.api.common.crud.exceptions import CRUDConfigurationError
from app.api.common.models.base import Base


def _get_model_relationships(model: type[Base]) -> dict[str, QueryableAttribute[Any]]:
    """Return relationship attributes keyed by relationship name."""
    mapper = inspect(model)
    if not mapper:
        return {}

    return {rel.key: cast("QueryableAttribute[Any]", getattr(model, rel.key)) for rel in mapper.relationships}


def apply_loader_profile[T, ModelT: Base](
    statement: Select[tuple[T]],
    model: type[ModelT],
    loaders: frozenset[str] | set[str] | None = None,
    *,
    read_schema: type[BaseModel] | None = None,
) -> Select[tuple[T]]:
    """Apply eager/noload options for relationships selected by a loader profile."""
    relationships = _get_model_relationships(model)
    if not relationships:
        return statement

    statement = statement.options(raiseload("*"))

    schema_relationships = (
        {name for name in relationships if name in read_schema.model_fields}
        if read_schema is not None
        else set(relationships)
    )
    selected = (set(loaders) if loaders else set()) & schema_relationships
    unknown = (set(loaders) if loaders else set()) - set(relationships)
    if unknown:
        formatted = ", ".join(sorted(unknown))
        err_msg = f"{model.__name__} has no relationship(s): {formatted}"
        raise CRUDConfigurationError(err_msg)

    for rel_name in selected:
        statement = statement.options(selectinload(relationships[rel_name]))

    if read_schema is not None:
        for rel_name in schema_relationships - selected:
            statement = statement.options(noload(relationships[rel_name]))

    return statement
