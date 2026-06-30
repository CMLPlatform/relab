"""Public system-wide stats endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.stats.helpers import resolve_date_range
from app.api.stats.queries import compute_categories, compute_series, compute_totals
from app.api.stats.schemas import CategoriesResponse, SeriesResponse, TotalsResponse
from app.core.cache import cache

router = APIRouter(prefix="/stats", tags=["stats"])

_STATS_CACHE_TTL = 43200  # 12 hours

Granularity = Literal["day", "week", "month", "year"]

_LIMIT_QUERY = Query(ge=1, le=100)


@router.get("/totals", response_model=TotalsResponse)
@cache(expire=_STATS_CACHE_TTL, namespace="stats")
async def get_stats_totals(session: AsyncSessionDep) -> TotalsResponse:
    """System-wide all-time aggregate statistics."""
    totals, generated_at = await compute_totals(session)
    return TotalsResponse(generated_at=generated_at, totals=totals)


@router.get("/categories", response_model=CategoriesResponse)
@cache(expire=_STATS_CACHE_TTL, namespace="stats")
async def get_stats_categories(
    session: AsyncSessionDep,
    limit: Annotated[int, _LIMIT_QUERY] = 25,
) -> CategoriesResponse:
    """Non-zero product categories ordered by teardown count, capped at limit (max 100)."""
    categories, generated_at = await compute_categories(session, limit)
    return CategoriesResponse(generated_at=generated_at, limit=limit, categories=categories)


@router.get("/series", response_model=SeriesResponse)
@cache(expire=_STATS_CACHE_TTL, namespace="stats")
async def get_stats_series(
    session: AsyncSessionDep,
    granularity: Granularity = Query(default="month"),
    start: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
    end: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> SeriesResponse:
    """Time-bucketed activity series. Granularity: day | week | month | year."""
    from datetime import date

    start_date = date.fromisoformat(start) if start else None
    end_date = date.fromisoformat(end) if end else None
    effective_start, effective_end = resolve_date_range(granularity, start_date, end_date)

    series, generated_at = await compute_series(session, granularity, effective_start, effective_end)
    return SeriesResponse(
        granularity=granularity,
        start=effective_start,
        end=effective_end,
        generated_at=generated_at,
        series=series,
    )
