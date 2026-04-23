"""Pagination helpers for SQLAlchemy select statements."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from fastapi_pagination import create_page
from fastapi_pagination.api import resolve_params
from sqlalchemy import Select, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.api.common.models.custom_types import MT

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi_pagination import Page
    from fastapi_pagination.bases import AbstractParams


def _primary_key_column(model: type[MT]) -> ColumnElement[object] | None:
    mapper = inspect(model)
    primary_keys = list(mapper.primary_key) if mapper else []
    return cast("ColumnElement[object]", primary_keys[0]) if len(primary_keys) == 1 else None


async def paginate_select(
    db: AsyncSession,
    statement: Select[Any],
    *,
    model: type[MT] | None = None,
    params: AbstractParams | None = None,
    mutate_items: Callable[[list[Any]], None] | None = None,
) -> Page[Any]:
    """Paginate a select with distinct-safe counts for ORM entity queries."""
    resolved_params = resolve_params(params)
    raw_params = resolved_params.to_raw_params()

    total = None
    if raw_params.include_total:
        if model is not None and (pk_col := _primary_key_column(model)) is not None:
            subquery = statement.with_only_columns(pk_col).order_by(None).distinct().subquery()
            total = (await db.execute(select(func.count()).select_from(subquery))).scalar_one()
        else:
            count_query = select(func.count()).select_from(statement.order_by(None).subquery())
            total = (await db.execute(count_query)).scalar_one()

    paginated_statement = statement.distinct() if model is not None else statement
    limit = getattr(raw_params, "limit", None)
    offset = getattr(raw_params, "offset", None)
    if limit is not None:
        paginated_statement = paginated_statement.limit(limit)
    if offset is not None:
        paginated_statement = paginated_statement.offset(offset)

    items = list((await db.execute(paginated_statement)).scalars().unique().all())
    if mutate_items is not None:
        mutate_items(items)

    return cast("Page[Any]", create_page(items, total=total, params=resolved_params))
