"""Unit tests for stats helper functions."""

from datetime import UTC, date, datetime, timedelta

import pytest

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


@pytest.mark.parametrize(
    ("granularity", "delta"),
    [
        ("day", timedelta(days=90)),
        ("week", timedelta(weeks=52)),
        ("month", timedelta(days=731)),
        ("year", timedelta(days=3653)),
    ],
)
def test_default_start_offset_by_granularity(granularity: str, delta: timedelta) -> None:
    """Default start is today minus the granularity-specific window."""
    today = datetime.now(UTC).date()
    start, end = resolve_date_range(granularity, None, None)
    assert end == today
    assert start == today - delta


def test_explicit_end_used_when_start_omitted() -> None:
    """Explicit end used when start omitted."""
    end = date(2025, 6, 30)
    start, returned_end = resolve_date_range("month", None, end)
    assert returned_end == end
    assert start == end - timedelta(days=731)


_DT = datetime(2025, 7, 14, 10, 30, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("granularity", "expected"),
    [
        ("day", "2025-07-14"),
        ("week", "2025-07-14"),  # Monday of the week
        ("month", "2025-07"),
        ("year", "2025"),
    ],
)
def test_format_period_by_granularity(granularity: str, expected: str) -> None:
    """format_period renders each granularity to its expected label."""
    assert format_period(_DT, granularity) == expected
