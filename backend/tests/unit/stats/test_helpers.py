"""Unit tests for stats helper functions."""

from datetime import UTC, date, datetime, timedelta

from app.api.stats.helpers import format_period, resolve_date_range


def test_explicit_start_and_end_returned_unchanged() -> None:
    """Explicit start and end returned unchanged."""
    start = date(2025, 1, 1)
    end = date(2025, 12, 31)
    assert resolve_date_range("month", start, end) == (start, end)


def test_default_end_is_today() -> None:
    """Default end is today."""
    _, end = resolve_date_range("month", None, None)
    assert end == datetime.now(UTC).date()


def test_day_granularity_defaults_to_90_days() -> None:
    """Day granularity defaults to 90 days."""
    today = datetime.now(UTC).date()
    start, end = resolve_date_range("day", None, None)
    assert end == today
    assert start == today - timedelta(days=90)


def test_week_granularity_defaults_to_52_weeks() -> None:
    """Week granularity defaults to 52 weeks."""
    today = datetime.now(UTC).date()
    start, _ = resolve_date_range("week", None, None)
    assert start == today - timedelta(weeks=52)


def test_month_granularity_defaults_to_731_days() -> None:
    """Month granularity defaults to 731 days."""
    today = datetime.now(UTC).date()
    start, _ = resolve_date_range("month", None, None)
    assert start == today - timedelta(days=731)


def test_year_granularity_defaults_to_3653_days() -> None:
    """Year granularity defaults to 3653 days."""
    today = datetime.now(UTC).date()
    start, _ = resolve_date_range("year", None, None)
    assert start == today - timedelta(days=3653)


def test_explicit_end_used_when_start_omitted() -> None:
    """Explicit end used when start omitted."""
    end = date(2025, 6, 30)
    start, returned_end = resolve_date_range("month", None, end)
    assert returned_end == end
    assert start == end - timedelta(days=731)


_DT = datetime(2025, 7, 14, 10, 30, 0, tzinfo=UTC)


def test_day_format() -> None:
    """Day format."""
    assert format_period(_DT, "day") == "2025-07-14"


def test_week_format_is_monday_date() -> None:
    """Week format is monday date."""
    assert format_period(_DT, "week") == "2025-07-14"


def test_month_format() -> None:
    """Month format."""
    assert format_period(_DT, "month") == "2025-07"


def test_year_format() -> None:
    """Year format."""
    assert format_period(_DT, "year") == "2025"
