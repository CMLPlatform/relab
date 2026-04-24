"""Small query helpers for common SQLAlchemy CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import CRUDConfigurationError, ModelsNotFoundError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import LoaderProfile, apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.utils import ensure_model_exists
from app.api.common.models.custom_types import IDT, MT
from app.api.common.sa_typing import column_expr

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from fastapi_filter.contrib.sqlalchemy import Filter
    from fastapi_pagination import Page
    from pydantic import BaseModel


async def page_models(
    db: AsyncSession,
    model: type[MT],
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    filters: Filter | None = None,
    statement: Select[tuple[Any]] | None = None,
    read_schema: type[BaseModel] | None = None,
    mutate_items: Callable[[list[Any]], None] | None = None,
) -> Page[Any]:
    """Return a page of models matching a query."""
    statement = statement if statement is not None else select(model)
    statement = apply_filter(statement, model, filters)
    statement = apply_loader_profile(statement, model, loaders, read_schema=read_schema)
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

    statement: Select[tuple[MT]] = select(model).filter_by(id=model_id)
    statement = apply_loader_profile(statement, model, loaders, read_schema=read_schema)
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

    statement = select(model).where(column_expr(model.id).in_(model_ids))  # type: ignore[attr-defined]
    found_models = list((await db.execute(statement)).scalars().all())
    if len(found_models) != len(model_ids):
        found_ids: set[int | UUID] = {cast("int | UUID", db_model.__dict__["id"]) for db_model in found_models}
        missing_ids = cast("set[int | UUID]", model_ids) - found_ids
        raise ModelsNotFoundError(model, missing_ids)
    return found_models


async def exists(db: AsyncSession, model: type[MT], model_id: IDT) -> bool:
    """Return whether a model exists."""
    return await get_model(db, model, model_id) is not None
