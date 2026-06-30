"""Unit tests for stats helper functions."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.api.stats.helpers import format_period, resolve_date_range


class TestResolveDateRange:
    def test_explicit_start_and_end_returned_unchanged(self) -> None:
        start = date(2025, 1, 1)
        end = date(2025, 12, 31)
        assert resolve_date_range("month", start, end) == (start, end)

    def test_default_end_is_today(self) -> None:
        _, end = resolve_date_range("month", None, None)
        assert end == date.today()

    def test_day_granularity_defaults_to_90_days(self) -> None:
        today = date.today()
        start, end = resolve_date_range("day", None, None)
        assert end == today
        assert start == today - timedelta(days=90)

    def test_week_granularity_defaults_to_52_weeks(self) -> None:
        today = date.today()
        start, _ = resolve_date_range("week", None, None)
        assert start == today - timedelta(weeks=52)

    def test_month_granularity_defaults_to_731_days(self) -> None:
        today = date.today()
        start, _ = resolve_date_range("month", None, None)
        assert start == today - timedelta(days=731)

    def test_year_granularity_defaults_to_3653_days(self) -> None:
        today = date.today()
        start, _ = resolve_date_range("year", None, None)
        assert start == today - timedelta(days=3653)

    def test_explicit_end_used_when_start_omitted(self) -> None:
        end = date(2025, 6, 30)
        start, returned_end = resolve_date_range("month", None, end)
        assert returned_end == end
        assert start == end - timedelta(days=731)


class TestFormatPeriod:
    _DT = datetime(2025, 7, 14, 10, 30, 0, tzinfo=timezone.utc)

    def test_day_format(self) -> None:
        assert format_period(self._DT, "day") == "2025-07-14"

    def test_week_format_is_monday_date(self) -> None:
        assert format_period(self._DT, "week") == "2025-07-14"

    def test_month_format(self) -> None:
        assert format_period(self._DT, "month") == "2025-07"

    def test_year_format(self) -> None:
        assert format_period(self._DT, "year") == "2025"
