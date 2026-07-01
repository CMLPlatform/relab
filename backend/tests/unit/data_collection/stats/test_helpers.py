"""Unit tests for stats helper functions."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.api.data_collection.stats.helpers import format_period, resolve_date_range


def test_explicit_start_and_end_returned_unchanged() -> None:
    start = date(2025, 1, 1)
    end = date(2025, 12, 31)
    assert resolve_date_range("month", start, end) == (start, end)

def test_default_end_is_today() -> None:
    _, end = resolve_date_range("month", None, None)
    assert end == date.today()

def test_day_granularity_defaults_to_90_days() -> None:
    today = date.today()
    start, end = resolve_date_range("day", None, None)
    assert end == today
    assert start == today - timedelta(days=90)

def test_week_granularity_defaults_to_52_weeks() -> None:
    today = date.today()
    start, _ = resolve_date_range("week", None, None)
    assert start == today - timedelta(weeks=52)

def test_month_granularity_defaults_to_731_days() -> None:
    today = date.today()
    start, _ = resolve_date_range("month", None, None)
    assert start == today - timedelta(days=731)

def test_year_granularity_defaults_to_3653_days() -> None:
    today = date.today()
    start, _ = resolve_date_range("year", None, None)
    assert start == today - timedelta(days=3653)

def test_explicit_end_used_when_start_omitted() -> None:
    end = date(2025, 6, 30)
    start, returned_end = resolve_date_range("month", None, end)
    assert returned_end == end
    assert start == end - timedelta(days=731)

_DT = datetime(2025, 7, 14, 10, 30, 0, tzinfo=UTC)


def test_day_format() -> None:
    assert format_period(_DT, "day") == "2025-07-14"

def test_week_format_is_monday_date() -> None:
    assert format_period(_DT, "week") == "2025-07-14"

def test_month_format() -> None:
    assert format_period(_DT, "month") == "2025-07"

def test_year_format() -> None:
    assert format_period(_DT, "year") == "2025"
