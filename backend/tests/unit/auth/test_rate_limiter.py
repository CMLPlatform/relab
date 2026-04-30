"""Unit tests for the custom rate limiter."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from fastapi import Request

from app.api.auth.services.rate_limiter import (
    Limiter,
    RateLimitExceededError,
    _find_request,
    rate_limit_exceeded_handler,
)


def _make_request() -> MagicMock:
    """Return a ``MagicMock`` that passes ``isinstance(…, Request)`` checks."""
    return MagicMock(spec=Request)


# ---------------------------------------------------------------------------
# _find_request
# ---------------------------------------------------------------------------


class TestFindRequest:
    """Tests for the internal function that looks for a Request object in the arguments of a rate-limited endpoint."""

    def test_finds_request_in_args(self) -> None:
        """When a Request object is present in the positional arguments, it should be returned."""
        req = _make_request()
        assert _find_request((req,), {}) is req

    def test_finds_request_in_kwargs(self) -> None:
        """When a Request object is present in the keyword arguments, it should be returned."""
        req = _make_request()
        assert _find_request((), {"request": req}) is req

    def test_returns_none_when_absent(self) -> None:
        """When no Request object is present in either args or kwargs, the function should return None."""
        assert _find_request(("a", 1), {"key": "val"}) is None


# ---------------------------------------------------------------------------
# RateLimitExceededError
# ---------------------------------------------------------------------------


class TestRateLimitExceededError:
    """Tests for the custom exception that is raised when a rate limit is exceeded."""

    def test_default_detail(self) -> None:
        """When no custom message is provided, the detail should be "Rate limit exceeded"."""
        exc = RateLimitExceededError()
        assert exc.detail == "Rate limit exceeded"
        assert str(exc) == "Rate limit exceeded"

    def test_custom_detail(self) -> None:
        """You can provide a custom detail message when raising the exception."""
        exc = RateLimitExceededError("custom")
        assert exc.detail == "custom"


# ---------------------------------------------------------------------------
# rate_limit_exceeded_handler
# ---------------------------------------------------------------------------


class TestRateLimitExceededHandler:
    """Tests for the exception handler that converts a RateLimitExceededError into an HTTP response."""

    def test_returns_429(self) -> None:
        """The handler should return a 429 Too Many Requests status code."""
        resp = rate_limit_exceeded_handler(MagicMock(), RateLimitExceededError())
        assert resp.status_code == 429

    def test_body_contains_detail(self) -> None:
        """The response body should include the error detail message."""
        resp = rate_limit_exceeded_handler(MagicMock(), RateLimitExceededError("nope"))
        body = json.loads(bytes(resp.body))
        assert body["detail"] == "nope"


# ---------------------------------------------------------------------------
# Limiter
# ---------------------------------------------------------------------------


@pytest.fixture
def limiter() -> Limiter:
    """Limiter backed by an in-memory storage (no Redis needed)."""
    return Limiter(
        key_func=lambda _: "test-key",
        storage_uri="memory://",
        strategy="fixed-window",
        enabled=True,
    )


class TestLimiter:
    """Tests for the Limiter class that enforces rate limits on FastAPI endpoints."""

    async def test_allows_requests_under_limit(self, limiter: Limiter) -> None:
        """When the number of requests is within the defined limit, they should be allowed to proceed."""

        @limiter.limit("5/minute")
        async def endpoint(_request: Request) -> str:
            return "ok"

        req = _make_request()
        for _ in range(5):
            assert await endpoint(req) == "ok"

    async def test_raises_when_limit_exceeded(self, limiter: Limiter) -> None:
        """When the number of requests exceeds the defined limit, a RateLimitExceededError should be raised."""

        @limiter.limit("2/minute")
        async def endpoint(_request: Request) -> str:
            return "ok"

        req = _make_request()
        await endpoint(req)
        await endpoint(req)

        with pytest.raises(RateLimitExceededError):
            await endpoint(req)

    async def test_disabled_limiter_skips_check(self) -> None:
        """When the limiter is not enabled it should not enforce any limits and should allow all requests."""
        disabled = Limiter(
            key_func=lambda _: "key",
            storage_uri="memory://",
            enabled=False,
        )

        @disabled.limit("1/minute")
        async def endpoint(_request: Request) -> str:
            return "ok"

        req = _make_request()
        # Should never raise even though limit is 1/min
        for _ in range(10):
            assert await endpoint(req) == "ok"

    async def test_different_keys_have_separate_limits(self) -> None:
        """When different keys are used, they should be rate limited separately."""
        call_count = 0

        def key_func(request: Request) -> str:
            return request.headers.get("X-Client-ID", "default")

        lim = Limiter(key_func=key_func, storage_uri="memory://", enabled=True)

        @lim.limit("1/minute")
        async def endpoint(_request: Request) -> str:
            nonlocal call_count
            call_count += 1
            return "ok"

        req_a = _make_request()
        req_a.headers.get.return_value = "client-a"

        req_b = _make_request()
        req_b.headers.get.return_value = "client-b"

        await endpoint(req_a)
        await endpoint(req_b)
        assert call_count == 2  # Both succeed with their own bucket

    def test_hit_key_limits_explicit_non_request_buckets(self, limiter: Limiter) -> None:
        """Explicit buckets support small auth-service checks without endpoint introspection."""
        limiter.hit_key("1/minute", "auth:login:account:one")

        with pytest.raises(RateLimitExceededError):
            limiter.hit_key("1/minute", "auth:login:account:one")

        limiter.hit_key("1/minute", "auth:login:account:two")

    async def test_no_request_arg_skips_check(self, limiter: Limiter) -> None:
        """When no Request is found in args, the limiter should not block."""

        @limiter.limit("1/minute")
        async def endpoint(data: str) -> str:
            return data

        # No Request object passed — limiter has nothing to key on, so it passes through
        assert await endpoint("hello") == "hello"
        assert await endpoint("hello") == "hello"
