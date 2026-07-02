"""Pure helper functions for the stats endpoints."""

from __future__ import annotations

from datetime import date, datetime, timedelta

# Default lookback window per granularity, expressed as timedelta.
# Approximate for month/year — exact enough given SQL date_trunc rounding.
_DEFAULT_DELTAS: dict[str, timedelta] = {
    "day": timedelta(days=90),
    "week": timedelta(weeks=52),
    "month": timedelta(days=731),  # ~24 months
    "year": timedelta(days=3653),  # ~10 years
}

_PERIOD_FORMATS: dict[str, str] = {
    "day": "%Y-%m-%d",
    "week": "%Y-%m-%d",  # PostgreSQL date_trunc('week') returns the Monday
    "month": "%Y-%m",
    "year": "%Y",
}


def resolve_date_range(
    granularity: str,
    start: date | None,
    end: date | None,
) -> tuple[date, date]:
    """Return the effective (start, end) date range for a series query."""
    effective_end = end or date.today()
    effective_start = start if start is not None else effective_end - _DEFAULT_DELTAS[granularity]
    return effective_start, effective_end


def format_period(dt: datetime, granularity: str) -> str:
    """Format a date_trunc result as the canonical period string."""
    return dt.strftime(_PERIOD_FORMATS[granularity])
