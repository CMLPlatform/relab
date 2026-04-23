"""Unit tests for logging helpers."""

from __future__ import annotations

from app.core.logging import sanitize_log_value


def test_sanitize_log_value_strips_newlines() -> None:
    """sanitize_log_value should neutralize log-breaking line separators."""
    assert sanitize_log_value("first\nsecond\rthird") == "first second third"
