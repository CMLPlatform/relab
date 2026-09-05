"""Public system-wide stats endpoints."""

from datetime import date
from typing import Annotated, Literal

from fastapi import HTTPException, Query

from app.api.common.audiences import PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.stats.helpers import resolve_date_range
from app.api.stats.queries import compute_categories, compute_series, compute_totals
from app.api.stats.schemas import CategoriesResponse, CategoryScope, SeriesResponse, TotalsResponse
from app.core.cache import cache
from app.core.config import CacheNamespace, settings

router = PublicAPIRouter(prefix="/stats", tags=["stats"])

Granularity = Literal["day", "week", "month", "year"]

_LIMIT_QUERY = Query(ge=1, le=100)


@router.get("/totals", response_model=TotalsResponse)
@cache(expire=settings.cache.ttls[CacheNamespace.STATS], namespace=CacheNamespace.STATS)
async def get_stats_totals(session: AsyncSessionDep) -> TotalsResponse:
    """System-wide all-time aggregate statistics."""
    totals, generated_at = await compute_totals(session)
    return TotalsResponse(generated_at=generated_at, totals=totals)


@router.get("/categories", response_model=CategoriesResponse)
@cache(expire=settings.cache.ttls[CacheNamespace.STATS], namespace=CacheNamespace.STATS)
async def get_stats_categories(
    session: AsyncSessionDep,
    limit: Annotated[int, _LIMIT_QUERY] = 25,
    scope: CategoryScope = Query(default=CategoryScope.PRODUCTS),
) -> CategoriesResponse:
    """Product categories ordered by count, capped at limit (max 100).

    `scope` selects what is counted: `products` (top-level products only, the
    default), `components` (categorised by the component's own type), or `all`.
    """
    categories, generated_at = await compute_categories(session, limit, scope)
    return CategoriesResponse(generated_at=generated_at, limit=limit, scope=scope, categories=categories)


@router.get("/series", response_model=SeriesResponse)
@cache(expire=settings.cache.ttls[CacheNamespace.STATS], namespace=CacheNamespace.STATS)
async def get_stats_series(
    session: AsyncSessionDep,
    granularity: Granularity = Query(default="month"),
    start: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
    end: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> SeriesResponse:
    """Time-bucketed activity series. Granularity: day | week | month | year."""
    start_date = date.fromisoformat(start) if start else None
    end_date = date.fromisoformat(end) if end else None
    effective_start, effective_end = resolve_date_range(granularity, start_date, end_date)

    if effective_start > effective_end:
        raise HTTPException(status_code=422, detail="start must not be after end")

    series, generated_at = await compute_series(session, granularity, effective_start, effective_end)
    return SeriesResponse(
        granularity=granularity,
        start=effective_start,
        end=effective_end,
        generated_at=generated_at,
        series=series,
    )
