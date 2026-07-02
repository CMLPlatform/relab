"""Response schemas for the public system-wide stats endpoints."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class Totals(BaseModel):
    """System-wide cumulative counts across all data."""

    model_config = ConfigDict(frozen=True)

    teardowns: int
    parts: int
    mass_kg: float
    images: int
    users: int


class TotalsResponse(BaseModel):
    """Response payload for the totals endpoint."""

    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    totals: Totals


class CategoryStat(BaseModel):
    """Teardown and part counts for a single category."""

    model_config = ConfigDict(frozen=True)

    name: str
    teardowns: int
    parts: int


class CategoriesResponse(BaseModel):
    """Response payload for the top-categories endpoint."""

    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    limit: int
    categories: list[CategoryStat]


class SeriesPoint(BaseModel):
    """Aggregated metrics for one period of a time series."""

    model_config = ConfigDict(frozen=True)

    period: str
    teardowns: int
    parts: int
    mass_kg: float
    images: int
    users_new: int
    users_active: int


class SeriesResponse(BaseModel):
    """Response payload for the time-series endpoint."""

    model_config = ConfigDict(frozen=True)

    granularity: str
    start: date
    end: date
    generated_at: datetime
    series: list[SeriesPoint]
