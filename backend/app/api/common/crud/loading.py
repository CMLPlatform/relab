"""Relationship loading helpers for SQLAlchemy CRUD queries."""

from enum import StrEnum
from typing import Any, Self, cast

from pydantic import BaseModel
from sqlalchemy import Select, inspect
from sqlalchemy.orm import joinedload, noload, selectinload
from sqlalchemy.orm.attributes import QueryableAttribute

from app.api.common.crud.exceptions import CRUDConfigurationError
from app.api.common.models.base import Base
from app.api.common.models.custom_types import MT


class RelationshipLoadStrategy(StrEnum):
    """Loading strategies for relationships in SQLAlchemy queries."""

    SELECTIN = "selectin"
    JOINED = "joined"


class LoaderProfile(frozenset[str]):
    """Named set of relationships to eagerly load for a response shape."""

    def __new__(cls, relationships: set[str] | frozenset[str] = frozenset()) -> Self:
        """Create a loader profile from relationship names."""
        return cast("Self", super().__new__(cls, relationships))


def _get_model_relationships(model: type[MT]) -> dict[str, QueryableAttribute[Any]]:
    """Return relationship attributes keyed by relationship name."""
    mapper = inspect(model)
    if not mapper:
        return {}

    return {rel.key: cast("QueryableAttribute[Any]", getattr(model, rel.key)) for rel in mapper.relationships}


def relationship_names(model: type[MT]) -> set[str]:
    """Return valid relationship names for a model."""
    return set(_get_model_relationships(model))


def relationship_attr(model: type[MT], name: str) -> QueryableAttribute[Any]:
    """Return a typed relationship attribute by name."""
    relationships = _get_model_relationships(model)
    try:
        return relationships[name]
    except KeyError as exc:
        err_msg = f"{model.__name__} has no relationship named {name!r}"
        raise CRUDConfigurationError(err_msg) from exc


def apply_loader_profile[T, ModelT: Base](
    statement: Select[tuple[T]],
    model: type[ModelT],
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    *,
    read_schema: type[BaseModel] | None = None,
    load_strategy: RelationshipLoadStrategy = RelationshipLoadStrategy.SELECTIN,
) -> Select[tuple[T]]:
    """Apply eager/noload options for relationships selected by a loader profile."""
    relationships = _get_model_relationships(model)
    if not relationships:
        return statement

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
        rel_attr = relationships[rel_name]
        option = joinedload(rel_attr) if load_strategy == RelationshipLoadStrategy.JOINED else selectinload(rel_attr)
        statement = statement.options(option)

    if read_schema is not None:
        for rel_name in schema_relationships - selected:
            statement = statement.options(noload(relationships[rel_name]))

    return statement
