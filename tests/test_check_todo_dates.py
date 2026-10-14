"""Unit tests for scripts/check_todo_dates.py."""

from __future__ import annotations

import datetime as dt

import check_todo_dates as c

TODAY = dt.date(2026, 10, 14)


def test_expired_date_fails() -> None:
    assert c.scan_lines("f", ["# TODO(drop-by 2026-10-13): x"], TODAY) == ["f:1: drop-by 2026-10-13 has passed"]


def test_future_and_today_pass() -> None:
    assert not c.scan_lines("f", ["# TODO(drop-by 2026-10-14): drop x", "# TODO(drop-by 2027-01-01): remove y"], TODAY)


def test_undated_compat_todo_fails() -> None:
    hits = c.scan_lines("f", ["# TODO: drop the old name", "# TODO: remove fallback"], TODAY)
    assert [h.split(":")[1] for h in hits] == ["1", "2"]


def test_plain_todo_passes() -> None:
    assert not c.scan_lines(
        "f", ["# TODO: add a retry", "we drop the table", "the todo list: remove done items"], TODAY
    )


def test_documented_format_passes() -> None:
    assert not c.scan_lines("f", ["Write `TODO(drop-by YYYY-MM-DD): drop the shim` for compat code."], TODAY)


def test_invalid_date_is_reported() -> None:
    assert c.scan_lines("f", ["# TODO(drop-by 2027-02-30): x"], TODAY) == [
        "f:1: drop-by 2027-02-30 is not a valid date"
    ]


def test_trivy_entries_need_scope() -> None:
    text = "  - id: A\n    paths: [x]\n  - id: B\n    expired_at: 1\n  - id: C\n    purls: [p]\n"
    assert c.unscoped_trivy_entries(text) == [3]
