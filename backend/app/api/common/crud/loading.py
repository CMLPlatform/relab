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
    raiseload_nested: bool = False,
) -> Select[tuple[T]]:
    """Apply eager/noload options for relationships selected by a loader profile.

    ``raiseload_nested`` chains ``raiseload("*")`` under each eagerly loaded relationship,
    so a selected relationship's own children are not loaded. Use it when the nested read
    schema declares no relationships of its own (e.g. categorized-reference categories load
    as ``CategoryRead``, which has neither ``subcategories`` nor ``supercategory``) to avoid
    firing the target model's default eager loaders and discarding the result.
    """
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
        loader = selectinload(relationships[rel_name])
        statement = statement.options(loader.raiseload("*") if raiseload_nested else loader)

    if read_schema is not None:
        for rel_name in schema_relationships - selected:
            statement = statement.options(noload(relationships[rel_name]))

    return statement
