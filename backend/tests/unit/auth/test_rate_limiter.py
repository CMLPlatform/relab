"""Unit tests for the custom rate limiter."""

from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock

import pytest
from fastapi import Request

from app.api.auth.services.rate_limiter import (
    Limiter,
    RateLimitExceededError,
    rate_limit_bucket_key,
    rate_limit_exceeded_handler,
    request_ip_rate_limit_key,
)


def _make_request() -> MagicMock:
    """Return a ``MagicMock`` that passes ``isinstance(…, Request)`` checks."""
    return MagicMock(spec=Request)


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
# Privacy-preserving keys
# ---------------------------------------------------------------------------


class TestRateLimitBucketKey:
    """Tests for privacy-preserving explicit rate-limit bucket keys."""

    def test_returns_stable_hmac_key_with_readable_prefix(self) -> None:
        """The generated key should be stable without exposing the raw value."""
        key = rate_limit_bucket_key("auth:login:ip", "203.0.113.10")

        assert key == rate_limit_bucket_key("auth:login:ip", "203.0.113.10")
        assert key.startswith("auth:login:ip:")
        assert "203.0.113.10" not in key

    def test_different_values_use_different_buckets(self) -> None:
        """Different submitted values should not collide into the same bucket."""
        first = rate_limit_bucket_key("auth:login:ip", "203.0.113.10")
        second = rate_limit_bucket_key("auth:login:ip", "203.0.113.11")

        assert first != second

    def test_account_identifier_key_does_not_expose_submitted_identifier(self) -> None:
        """Submitted account identifiers should be normalized into keyed buckets."""
        key = rate_limit_bucket_key("auth:login:account", " User@Example.COM ")

        assert key == rate_limit_bucket_key("auth:login:account", "user@example.com")
        assert key.startswith("auth:login:account:")
        assert "User@Example.COM" not in key
        assert "user@example.com" not in key

    def test_request_ip_key_does_not_expose_client_ip(self) -> None:
        """Request-scoped per-IP limits should use a safe client-IP bucket."""
        request = _make_request()
        request.headers = {"CF-Connecting-IP": "203.0.113.10"}
        request.client = None

        key = request_ip_rate_limit_key(request)

        assert key.startswith("client:ip:")
        assert "203.0.113.10" not in key


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
    """Tests for the Limiter class that enforces request and explicit bucket limits."""

    def test_hit_request_allows_requests_under_limit(self, limiter: Limiter) -> None:
        """Requests within the defined limit should be allowed to proceed."""
        req = _make_request()
        for _ in range(5):
            limiter.hit_request("5/minute", req)

    def test_hit_request_raises_when_limit_exceeded(self, limiter: Limiter) -> None:
        """Requests beyond the defined limit should raise RateLimitExceededError."""
        req = _make_request()
        limiter.hit_request("2/minute", req)
        limiter.hit_request("2/minute", req)

        with pytest.raises(RateLimitExceededError):
            limiter.hit_request("2/minute", req)

    def test_disabled_limiter_skips_check(self) -> None:
        """When the limiter is not enabled it should not enforce any limits and should allow all requests."""
        disabled = Limiter(
            key_func=lambda _: "key",
            storage_uri="memory://",
            enabled=False,
        )
        req = _make_request()

        for _ in range(10):
            disabled.hit_request("1/minute", req)

    def test_different_keys_have_separate_limits(self) -> None:
        """When different keys are used, they should be rate limited separately."""

        def key_func(request: Request) -> str:
            return request.headers.get("X-Client-ID", "default")

        lim = Limiter(key_func=key_func, storage_uri="memory://", enabled=True)
        req_a = _make_request()
        req_a.headers.get.return_value = "client-a"

        req_b = _make_request()
        req_b.headers.get.return_value = "client-b"

        lim.hit_request("1/minute", req_a)
        lim.hit_request("1/minute", req_b)

    def test_hit_key_limits_explicit_non_request_buckets(self, limiter: Limiter) -> None:
        """Explicit buckets support small auth-service checks without endpoint introspection."""
        limiter.hit_key("1/minute", "auth:login:account:one")

        with pytest.raises(RateLimitExceededError):
            limiter.hit_key("1/minute", "auth:login:account:one")

        limiter.hit_key("1/minute", "auth:login:account:two")

    def test_limit_exceeded_log_uses_safe_bucket_key(self, limiter: Limiter, caplog: pytest.LogCaptureFixture) -> None:
        """Rate-limit logs should not include raw identifiers when callers use safe buckets."""
        raw_ip = "203.0.113.10"
        safe_key = rate_limit_bucket_key("auth:login:ip", raw_ip)

        caplog.set_level(logging.INFO, logger="app.api.auth.services.rate_limiter")
        limiter.hit_key("1/minute", safe_key)

        with pytest.raises(RateLimitExceededError):
            limiter.hit_key("1/minute", safe_key)

        assert "auth:login:ip:" in caplog.text
        assert raw_ip not in caplog.text

    def test_dependency_limits_request_buckets(self, limiter: Limiter) -> None:
        """FastAPI route dependencies should enforce request-scoped limits without wrapping endpoints."""
        dependency = limiter.dependency("1/minute")
        req = _make_request()

        dependency.dependency(req)
        with pytest.raises(RateLimitExceededError):
            dependency.dependency(req)
