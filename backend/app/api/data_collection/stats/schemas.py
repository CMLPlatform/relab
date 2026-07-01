"""Response schemas for the public system-wide stats endpoints."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class Totals(BaseModel):
    model_config = ConfigDict(frozen=True)

    teardowns: int
    parts: int
    mass_kg: float
    images: int
    users: int


class TotalsResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    totals: Totals


class CategoryStat(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    teardowns: int
    parts: int


class CategoriesResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    limit: int
    categories: list[CategoryStat]


class SeriesPoint(BaseModel):
    model_config = ConfigDict(frozen=True)

    period: str
    teardowns: int
    parts: int
    mass_kg: float
    images: int
    users_new: int
    users_active: int


class SeriesResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    granularity: str
    start: date
    end: date
    generated_at: datetime
    series: list[SeriesPoint]
