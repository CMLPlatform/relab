"""Tests for auth rate limiting helpers."""

from __future__ import annotations

import inspect

import slowapi.extension as slowapi_extension


def test_slowapi_uses_supported_coro_check() -> None:
    """Ensure SlowAPI uses inspect.iscoroutinefunction instead of the deprecated asyncio helper."""
    assert slowapi_extension.asyncio.iscoroutinefunction is inspect.iscoroutinefunction
