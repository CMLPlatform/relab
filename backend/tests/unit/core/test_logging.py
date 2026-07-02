"""Unit tests for logging helpers."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from pythonjsonlogger.json import JsonFormatter

from app.core.logging import RequestContextFilter, build_json_formatter, log_context, sanitize_log_value

if TYPE_CHECKING:
    import pytest


def _record_value(record: logging.LogRecord, key: str) -> object:
    return getattr(record, key)


def test_sanitize_log_value_strips_newlines() -> None:
    """sanitize_log_value should neutralize log-breaking line separators."""
    assert sanitize_log_value("first\nsecond\rthird") == "first second third"


def test_request_context_filter_adds_defaults() -> None:
    """Log records should always receive request context attributes."""
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)

    RequestContextFilter().filter(record)

    assert _record_value(record, "request_id") == "-"
    assert _record_value(record, "http_method") is None
    assert _record_value(record, "http_path") is None
    assert _record_value(record, "http_status_code") is None
    assert _record_value(record, "http_latency_ms") is None


def test_request_context_filter_uses_context_values() -> None:
    """Request context should be copied onto each stdlib log record."""
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)

    with log_context(request_id="req-123", http_method="GET", http_path="/ping"):
        RequestContextFilter().filter(record)

    assert _record_value(record, "request_id") == "req-123"
    assert _record_value(record, "http_method") == "GET"
    assert _record_value(record, "http_path") == "/ping"


def test_json_formatter_includes_request_context() -> None:
    """Production JSON logs should include structured request context."""
    record = logging.LogRecord("test.logger", logging.INFO, __file__, 7, "hello %s", ("there",), None)
    record.__dict__.update(
        request_id="req-456",
        http_method="POST",
        http_path="/items",
        http_status_code=201,
        http_latency_ms=12.5,
    )

    formatter = build_json_formatter()

    assert isinstance(formatter, JsonFormatter)
    payload = json.loads(formatter.format(record))

    assert payload["level"] == "INFO"
    assert payload["name"] == "test.logger"
    assert payload["message"] == "hello there"
    assert payload["request_id"] == "req-456"
    assert payload["http_method"] == "POST"
    assert payload["http_path"] == "/items"
    assert payload["http_status_code"] == 201
    assert payload["http_latency_ms"] == 12.5


def test_context_is_available_to_stdlib_caplog(caplog: pytest.LogCaptureFixture) -> None:
    """Request context should work with stdlib logging only."""
    logger = logging.getLogger("tests.context")

    with caplog.at_level(logging.INFO, logger="tests.context"), log_context(request_id="req-caplog"):
        logger.info("captured")

    record = caplog.records[0]
    RequestContextFilter().filter(record)

    assert _record_value(record, "request_id") == "req-caplog"
