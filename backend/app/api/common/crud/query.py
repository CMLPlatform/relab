"""Composable query helpers for common SQLAlchemy CRUD operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from pydantic import BaseModel
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import CRUDConfigurationError, ModelsNotFoundError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import LoaderProfile, apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.utils import ensure_model_exists
from app.api.common.models.custom_types import IDT, MT

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from fastapi_filter.contrib.sqlalchemy import Filter
    from fastapi_pagination import Page


@dataclass(frozen=True, slots=True)
class QueryOptions:
    """Options for building an ORM entity select."""

    loaders: LoaderProfile | frozenset[str] | set[str] | None = None
    filters: Filter | None = None
    statement: Select[tuple[Any]] | None = None
    read_schema: type[BaseModel] | None = None


def build_query(model: type[MT], options: QueryOptions | None = None) -> Select[tuple[MT]]:
    """Build a SQLAlchemy select for a model."""
    options = options or QueryOptions()
    statement = cast("Select[tuple[MT]]", options.statement if options.statement is not None else select(model))
    statement = apply_filter(statement, model, options.filters)
    return apply_loader_profile(statement, model, options.loaders, read_schema=options.read_schema)


def _merge_options(
    options: QueryOptions | None,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    filters: Filter | None = None,
    statement: Select[tuple[Any]] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> QueryOptions | None:
    if options is not None:
        return options
    if loaders is None and filters is None and statement is None and read_schema is None:
        return None
    return QueryOptions(loaders=loaders, filters=filters, statement=statement, read_schema=read_schema)


async def list_models(
    db: AsyncSession,
    model: type[MT],
    options: QueryOptions | None = None,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    filters: Filter | None = None,
    statement: Select[tuple[Any]] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> list[MT]:
    """Return all models matching a query."""
    options = _merge_options(options, loaders=loaders, filters=filters, statement=statement, read_schema=read_schema)
    statement = build_query(model, options)
    return list((await db.execute(statement)).scalars().unique().all())


async def page_models(
    db: AsyncSession,
    model: type[MT],
    options: QueryOptions | None = None,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    filters: Filter | None = None,
    statement: Select[tuple[Any]] | None = None,
    read_schema: type[BaseModel] | None = None,
    mutate_items: Callable[[list[Any]], None] | None = None,
) -> Page[Any]:
    """Return a page of models matching a query."""
    options = _merge_options(options, loaders=loaders, filters=filters, statement=statement, read_schema=read_schema)
    statement = build_query(model, options)
    return await paginate_select(db, statement, model=model, mutate_items=mutate_items)


async def get_model(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> MT | None:
    """Return a model by primary key, or None when missing."""
    if not hasattr(model, "id"):
        err_msg = f"Model {model} does not have an id field."
        raise CRUDConfigurationError(err_msg)

    statement = build_query(model, QueryOptions(loaders=loaders, read_schema=read_schema)).filter_by(id=model_id)
    return (await db.execute(statement)).scalars().unique().one_or_none()


async def require_model(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> MT:
    """Return a model by primary key or raise ModelNotFoundError."""
    return ensure_model_exists(
        await get_model(db, model, model_id, loaders=loaders, read_schema=read_schema),
        model,
        model_id,
    )


async def require_models(
    db: AsyncSession,
    model: type[MT],
    model_ids: set[int] | set[UUID],
) -> list[MT]:
    """Return all requested models or raise when any ID is missing."""
    if not hasattr(model, "id"):
        err_msg = f"{model} does not have an 'id' attribute"
        raise CRUDConfigurationError(err_msg)

    statement = select(model).where(cast("Any", model).id.in_(model_ids))
    found_models = list((await db.execute(statement)).scalars().all())
    if len(found_models) != len(model_ids):
        found_ids: set[int | UUID] = {cast("int | UUID", db_model.__dict__["id"]) for db_model in found_models}
        missing_ids = cast("set[int | UUID]", model_ids) - found_ids
        raise ModelsNotFoundError(model, missing_ids)
    return found_models


async def exists(db: AsyncSession, model: type[MT], model_id: IDT) -> bool:
    """Return whether a model exists."""
    return await get_model(db, model, model_id) is not None
