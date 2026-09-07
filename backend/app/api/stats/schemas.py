"""Response schemas for the public system-wide stats endpoints."""

from datetime import date, datetime
from enum import StrEnum

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


class CategoryScope(StrEnum):
    """Which population a category breakdown counts.

    A product's category is its own ``product_type``, and every product carries
    one -- including components. A laptop torn down into a PCB and a screw
    contributes one product to "Laptop" and one component each to "PCB" and
    "Screw"; it contributes nothing to "Laptop" from its components. So the
    population being categorised has to be chosen explicitly:

    - ``PRODUCTS``: top-level products only (``parent_id IS NULL``) -- the
      things that were torn down.
    - ``COMPONENTS``: components only (``parent_id IS NOT NULL``) -- the parts
      extracted from them, categorised by the part's own type.
    - ``ALL``: both, categorised the same way.
    """

    PRODUCTS = "products"
    COMPONENTS = "components"
    ALL = "all"


class CategoryStat(BaseModel):
    """Count of products in a single category, within the requested scope."""

    model_config = ConfigDict(frozen=True)

    name: str
    count: int


class CategoriesResponse(BaseModel):
    """Response payload for the top-categories endpoint."""

    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    limit: int
    scope: CategoryScope
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
