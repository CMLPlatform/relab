"""Unit tests for the custom rate limiter."""

import json
import logging
from unittest.mock import MagicMock

import anyio
import pytest
from fastapi import Request
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.api.common.rate_limiting import (
    Limiter,
    RateLimitExceededError,
    rate_limit_bucket_key,
    rate_limit_exceeded_handler,
    request_ip_rate_limit_key,
)


def _make_request(client_ip: str = "203.0.113.10") -> MagicMock:
    """Return a ``MagicMock`` request that passes ``isinstance(…, Request)`` checks."""
    request = MagicMock(spec=Request)
    request.headers = {}
    request.client.host = client_ip
    return request


def test_default_detail() -> None:
    """When no custom message is provided, the detail should be "Rate limit exceeded"."""
    exc = RateLimitExceededError()
    assert exc.detail == "Rate limit exceeded"
    assert str(exc) == "Rate limit exceeded"


def test_custom_detail() -> None:
    """You can provide a custom detail message when raising the exception."""
    exc = RateLimitExceededError("custom")
    assert exc.detail == "custom"


# ---------------------------------------------------------------------------
# rate_limit_exceeded_handler
# ---------------------------------------------------------------------------


def test_returns_429() -> None:
    """The handler should return a 429 Too Many Requests status code."""
    resp = rate_limit_exceeded_handler(MagicMock(), RateLimitExceededError())
    assert resp.status_code == 429


def test_body_contains_detail() -> None:
    """The response body should include the error detail message."""
    resp = rate_limit_exceeded_handler(MagicMock(), RateLimitExceededError("nope"))
    body = json.loads(bytes(resp.body))
    assert body["detail"] == "nope"


# ---------------------------------------------------------------------------
# Privacy-preserving keys
# ---------------------------------------------------------------------------


def test_returns_stable_hmac_key_with_readable_prefix() -> None:
    """The generated key should be stable without exposing the raw value."""
    key = rate_limit_bucket_key("auth:login:ip", "203.0.113.10")

    assert key == rate_limit_bucket_key("auth:login:ip", "203.0.113.10")
    assert key.startswith("auth:login:ip:")
    assert "203.0.113.10" not in key


def test_different_values_use_different_buckets() -> None:
    """Different submitted values should not collide into the same bucket."""
    first = rate_limit_bucket_key("auth:login:ip", "203.0.113.10")
    second = rate_limit_bucket_key("auth:login:ip", "203.0.113.11")

    assert first != second


def test_account_identifier_key_does_not_expose_submitted_identifier() -> None:
    """Submitted account identifiers should be normalized into keyed buckets."""
    key = rate_limit_bucket_key("auth:login:account", " User@Example.COM ")

    assert key == rate_limit_bucket_key("auth:login:account", "user@example.com")
    assert key.startswith("auth:login:account:")
    assert "User@Example.COM" not in key
    assert "user@example.com" not in key


def test_request_ip_key_does_not_expose_client_ip() -> None:
    """Request-scoped per-IP limits should use a safe client-IP bucket."""
    request = _make_request("203.0.113.10")

    key = request_ip_rate_limit_key(request)

    assert key.startswith("client:ip:")
    assert "203.0.113.10" not in key


# ---------------------------------------------------------------------------
# Limiter
# ---------------------------------------------------------------------------


@pytest.fixture
def limiter() -> Limiter:
    """Limiter backed by an in-memory storage (no Redis needed)."""
    return Limiter(storage_uri="memory://")


def test_dependency_allows_requests_under_limit(limiter: Limiter) -> None:
    """Requests within the defined limit should be allowed to proceed."""
    check = limiter.dependency("5/minute").dependency
    req = _make_request()
    for _ in range(5):
        check(req)


def test_dependency_raises_when_limit_exceeded(limiter: Limiter) -> None:
    """Requests beyond the defined limit should raise RateLimitExceededError."""
    check = limiter.dependency("2/minute").dependency
    req = _make_request()
    check(req)
    check(req)

    with pytest.raises(RateLimitExceededError):
        check(req)


def test_disabled_limiter_skips_check() -> None:
    """When the limiter is not enabled it should not enforce any limits and should allow all requests."""
    check = Limiter(storage_uri="memory://", enabled=False).dependency("1/minute").dependency
    req = _make_request()

    for _ in range(10):
        check(req)


def test_different_client_ips_have_separate_limits(limiter: Limiter) -> None:
    """Requests from different client IPs should be rate limited separately."""
    check = limiter.dependency("1/minute").dependency

    check(_make_request("203.0.113.1"))
    check(_make_request("203.0.113.2"))


def test_hit_key_limits_explicit_non_request_buckets(limiter: Limiter) -> None:
    """Explicit buckets support small auth-service checks without endpoint introspection."""
    limiter.hit_key("1/minute", "auth:login:account:one")

    with pytest.raises(RateLimitExceededError):
        limiter.hit_key("1/minute", "auth:login:account:one")

    limiter.hit_key("1/minute", "auth:login:account:two")


def test_limit_exceeded_log_uses_safe_bucket_key(limiter: Limiter, caplog: pytest.LogCaptureFixture) -> None:
    """Rate-limit logs should not include raw identifiers when callers use safe buckets."""
    raw_ip = "203.0.113.10"
    safe_key = rate_limit_bucket_key("auth:login:ip", raw_ip)

    caplog.set_level(logging.INFO, logger="app.api.common.rate_limiting")
    limiter.hit_key("1/minute", safe_key)

    with pytest.raises(RateLimitExceededError):
        limiter.hit_key("1/minute", safe_key)

    assert "auth:login:ip:" in caplog.text
    assert raw_ip not in caplog.text


def test_hit_key_fails_open_on_redis_error(limiter: Limiter, caplog: pytest.LogCaptureFixture) -> None:
    """A Redis outage must fail open, not lock every caller out of auth endpoints."""

    class _RaisingStrategy:
        def hit(self, *_args: object, **_kwargs: object) -> bool:
            msg = "redis unreachable"
            raise RedisConnectionError(msg)

    limiter._limiter = _RaisingStrategy()

    caplog.set_level(logging.WARNING, logger="app.api.common.rate_limiting")
    limiter.hit_key("1/minute", "auth:login:account:one")  # must not raise

    assert "failing open" in caplog.text
    assert "auth:login:account:one" in caplog.text


def test_ahit_key_fails_open_on_redis_error(limiter: Limiter) -> None:
    """The async entrypoint must fail open too, since it delegates to hit_key."""

    class _RaisingStrategy:
        def hit(self, *_args: object, **_kwargs: object) -> bool:
            msg = "redis timed out"
            raise RedisTimeoutError(msg)

    limiter._limiter = _RaisingStrategy()

    anyio.run(limiter.ahit_key, "1/minute", "auth:login:account:two")  # must not raise


def test_dependency_limits_request_buckets(limiter: Limiter) -> None:
    """FastAPI route dependencies should enforce request-scoped limits without wrapping endpoints."""
    dependency = limiter.dependency("1/minute")
    req = _make_request()

    dependency.dependency(req)
    with pytest.raises(RateLimitExceededError):
        dependency.dependency(req)
