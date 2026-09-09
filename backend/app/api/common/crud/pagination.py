"""Pagination helpers for SQLAlchemy select statements."""

from typing import TYPE_CHECKING, cast

from fastapi_pagination import create_page
from fastapi_pagination.api import resolve_params
from sqlalchemy import Select, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Join

from app.api.common.models.base import Base

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi_pagination import Page
    from fastapi_pagination.bases import AbstractParams


def _primary_key_column(model: type[Base]) -> ColumnElement[object] | None:
    mapper = inspect(model)
    primary_keys = list(mapper.primary_key) if mapper else []
    return cast("ColumnElement[object]", primary_keys[0]) if len(primary_keys) == 1 else None


def _joins_rows(statement: Select[object]) -> bool:
    """Return whether the statement joins, and so can repeat an entity per row.

    Only a join can duplicate rows here, and ``.join()`` collapses the FROM list
    into a single ``Join`` element, so this is the whole test.
    """
    return any(isinstance(from_element, Join) for from_element in statement.get_final_froms())


async def paginate_select[T, U, ModelT: Base](
    db: AsyncSession,
    statement: Select[tuple[T]],
    *,
    model: type[ModelT] | None = None,
    params: AbstractParams | None = None,
    transform: Callable[[list[T]], list[U]] | None = None,
) -> Page[T] | Page[U]:
    """Paginate a select with distinct-safe counts for ORM entity queries.

    ``transform`` converts the loaded rows into response objects (e.g. Pydantic
    instances) before the page is built. Use it when response serialization
    needs per-row context (like viewer-aware privacy redaction) that cannot
    flow through FastAPI's response_model pass.
    """
    resolved_params = resolve_params(params)
    raw_params = resolved_params.to_raw_params()

    # DISTINCT only when a join can repeat rows: it sorts the whole filtered set before
    # LIMIT and runs correlated column properties (e.g. the thumbnail subquery) per
    # table row instead of per returned row.
    needs_distinct = _joins_rows(statement)

    total = None
    if raw_params.include_total:
        if model is not None and (pk_col := _primary_key_column(model)) is not None:
            count_source = statement.with_only_columns(pk_col).order_by(None)
            if needs_distinct:
                count_source = count_source.distinct()
            total = (await db.execute(select(func.count()).select_from(count_source.subquery()))).scalar_one()
        else:
            count_query = select(func.count()).select_from(statement.order_by(None).subquery())
            total = (await db.execute(count_query)).scalar_one()

    paginated_statement = statement.distinct() if model is not None and needs_distinct else statement

    # Append the primary key as a tie-breaker; without a total order a row can repeat
    # on one page and vanish from another.
    if model is not None and (pk_col := _primary_key_column(model)) is not None:
        paginated_statement = paginated_statement.order_by(pk_col)

    limit = getattr(raw_params, "limit", None)
    offset = getattr(raw_params, "offset", None)
    if limit is not None:
        paginated_statement = paginated_statement.limit(limit)
    if offset is not None:
        paginated_statement = paginated_statement.offset(offset)

    items: list[T] = list((await db.execute(paginated_statement)).scalars().unique().all())

    if transform is not None:
        transformed = transform(items)
        return cast("Page[U]", create_page(transformed, total=total, params=resolved_params))

    return cast("Page[T]", create_page(items, total=total, params=resolved_params))
