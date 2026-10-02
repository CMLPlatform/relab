"""Unit tests for the custom rate limiter."""

import json
import logging
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.auth.services.access_token_store import ACCESS_TOKEN_KEY_PREFIX, request_access_token_owner_id
from app.api.common.rate_limiting import (
    Limiter,
    RateLimitExceededError,
    rate_limit_bucket_key,
    rate_limit_exceeded_handler,
    request_ip_rate_limit_key,
)
from app.core.http_headers import AUTH_COOKIE_NAME
from app.core.runtime import AppServices

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from redis.asyncio import Redis


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


def test_sets_retry_after_from_the_window_reset() -> None:
    """A limiter rejection tells the client how long to wait."""
    resp = rate_limit_exceeded_handler(MagicMock(), RateLimitExceededError(retry_after=42))
    assert resp.headers["retry-after"] == "42"


async def test_hit_key_reports_seconds_until_the_window_resets() -> None:
    """The rejection carries the time left in the current window, at least one second."""
    limiter = Limiter(storage_uri="memory://")
    await limiter.ahit_key("1/minute", "bucket")

    with pytest.raises(RateLimitExceededError) as exc_info:
        await limiter.ahit_key("1/minute", "bucket")

    assert exc_info.value.retry_after is not None
    assert 1 <= exc_info.value.retry_after <= 60


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


async def test_dependency_raises_when_limit_exceeded(limiter: Limiter) -> None:
    """Requests beyond the defined limit should raise RateLimitExceededError."""
    check = limiter.dependency("2/minute").dependency
    assert check is not None
    req = _make_request()
    await check(req)
    await check(req)

    with pytest.raises(RateLimitExceededError):
        await check(req)


async def test_disabled_limiter_skips_check() -> None:
    """When the limiter is not enabled it should not enforce any limits and should allow all requests."""
    check = Limiter(storage_uri="memory://", enabled=False).dependency("1/minute").dependency
    assert check is not None
    req = _make_request()

    for _ in range(10):
        await check(req)


async def test_different_client_ips_have_separate_limits(limiter: Limiter) -> None:
    """Requests from different client IPs should be rate limited separately."""
    check = limiter.dependency("1/minute").dependency
    assert check is not None

    await check(_make_request("203.0.113.1"))
    await check(_make_request("203.0.113.2"))


async def test_hit_key_limits_explicit_non_request_buckets(limiter: Limiter) -> None:
    """Explicit buckets support small auth-service checks without endpoint introspection."""
    await limiter.ahit_key("1/minute", "auth:login:account:one")

    with pytest.raises(RateLimitExceededError):
        await limiter.ahit_key("1/minute", "auth:login:account:one")

    await limiter.ahit_key("1/minute", "auth:login:account:two")


async def test_limit_exceeded_log_omits_bucket_key(limiter: Limiter, caplog: pytest.LogCaptureFixture) -> None:
    """Rate-limit logs name the limit, never the bucket key or the identifier behind it."""
    raw_ip = "203.0.113.10"
    safe_key = rate_limit_bucket_key("auth:login:ip", raw_ip)

    caplog.set_level(logging.INFO, logger="app.api.common.rate_limiting")
    await limiter.ahit_key("1/minute", safe_key)

    with pytest.raises(RateLimitExceededError):
        await limiter.ahit_key("1/minute", safe_key)

    assert "1/minute" in caplog.text
    assert safe_key not in caplog.text
    assert raw_ip not in caplog.text


async def test_hit_key_fails_open_on_redis_error(limiter: Limiter, caplog: pytest.LogCaptureFixture) -> None:
    """A Redis outage must fail open, not lock every caller out of auth endpoints."""

    class _RaisingStrategy:
        def hit(self, *_args: object, **_kwargs: object) -> bool:
            msg = "redis unreachable"
            raise RedisConnectionError(msg)

    # A minimal stand-in for the real strategy: only the failure path matters here.
    limiter._limiter = _RaisingStrategy()  # ty: ignore[invalid-assignment]

    caplog.set_level(logging.WARNING, logger="app.api.common.rate_limiting")
    await limiter.ahit_key("1/minute", "auth:login:account:one")  # must not raise

    assert "failing open" in caplog.text
    assert "auth:login:account:one" not in caplog.text


async def test_hit_key_without_consume_only_checks(limiter: Limiter) -> None:
    """consume=False reports an exhausted bucket but never spends from it."""
    for _ in range(5):
        await limiter.ahit_key("1/minute", "auth:login:account:one", consume=False)
    await limiter.ahit_key("1/minute", "auth:login:account:one")

    with pytest.raises(RateLimitExceededError):
        await limiter.ahit_key("1/minute", "auth:login:account:one", consume=False)


# ---------------------------------------------------------------------------
# Per-user keying for signed-in requests
# ---------------------------------------------------------------------------

_ROOM_IP = "203.0.113.50"


@pytest.fixture
async def keyed_client(redis_client: Redis) -> AsyncGenerator[httpx.AsyncClient]:
    """App with one route limited to 2/minute per IP and 4/minute per signed-in user."""
    app = FastAPI()
    app.state.services = AppServices(redis=redis_client)
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)
    limiter = Limiter(storage_uri="memory://")

    per_user = ("4/minute", request_access_token_owner_id)

    @app.get("/limited", dependencies=[limiter.dependency("2/minute", per_user=per_user)])
    async def limited() -> dict[str, bool]:
        return {"ok": True}

    # Every request arrives from the same client IP, like a room behind one NAT.
    transport = ASGITransport(app=app, client=(_ROOM_IP, 1234))
    async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
        yield client


async def _issue_token(redis: Redis, user_id: str) -> str:
    token = f"token-{user_id}"
    await redis.set(f"{ACCESS_TOKEN_KEY_PREFIX}{token}", json.dumps({"sub": user_id, "iat": 0}))
    return token


async def _statuses(client: httpx.AsyncClient, count: int, headers: dict[str, str] | None = None) -> list[int]:
    return [(await client.get("/limited", headers=headers)).status_code for _ in range(count)]


@pytest.mark.parametrize("credential", ["bearer", "cookie"])
async def test_signed_in_requests_use_the_per_user_budget(
    keyed_client: httpx.AsyncClient, redis_client: Redis, credential: str
) -> None:
    """A bearer token or session cookie is counted in its user's bucket at the per-user rate."""

    async def sign_in(user_id: str) -> dict[str, str]:
        token = await _issue_token(redis_client, user_id)
        if credential == "cookie":
            keyed_client.cookies.set(AUTH_COOKIE_NAME, token)
            return {}
        return {"Authorization": f"Bearer {token}"}

    assert await _statuses(keyed_client, 5, await sign_in("user-a")) == [200, 200, 200, 200, 429]
    # A second user behind the same IP gets a budget of its own.
    assert await _statuses(keyed_client, 4, await sign_in("user-b")) == [200, 200, 200, 200]
    # Neither user's traffic touched the IP bucket.
    keyed_client.cookies.clear()
    assert await _statuses(keyed_client, 2) == [200, 200]


async def test_anonymous_requests_stay_per_ip(keyed_client: httpx.AsyncClient) -> None:
    """Without a token the per-IP budget applies."""
    assert await _statuses(keyed_client, 3) == [200, 200, 429]


async def test_unknown_tokens_fall_back_to_the_ip_bucket(keyed_client: httpx.AsyncClient) -> None:
    """Forged tokens share the IP bucket, so rotating them never buys a fresh budget."""
    statuses = [
        (await keyed_client.get("/limited", headers={"Authorization": f"Bearer forged-{i}"})).status_code
        for i in range(3)
    ]
    assert statuses == [200, 200, 429]


async def test_redis_error_during_lookup_falls_back_to_ip(keyed_client: httpx.AsyncClient, redis_client: Redis) -> None:
    """A token lookup failure keys the request per IP rather than failing it."""
    bearer = {"Authorization": f"Bearer {await _issue_token(redis_client, 'user-a')}"}

    with patch.object(redis_client, "get", side_effect=RedisConnectionError("down")):
        assert await _statuses(keyed_client, 3, bearer) == [200, 200, 429]


async def test_signed_in_ip_ceiling_caps_many_accounts_on_one_ip(redis_client: Redis) -> None:
    """Fresh accounts each get a user budget, but together they stop at the per-IP ceiling."""
    app = FastAPI()
    app.state.services = AppServices(redis=redis_client)
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)
    limiter = Limiter(storage_uri="memory://")
    per_user = ("2/minute", request_access_token_owner_id)

    @app.get(
        "/export", dependencies=[limiter.dependency("1/minute", per_user=per_user, signed_in_ip_ceiling="3/minute")]
    )
    async def export() -> dict[str, bool]:
        return {"ok": True}

    transport = ASGITransport(app=app, client=(_ROOM_IP, 1234))
    async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
        statuses = []
        for account in ("a", "b", "c", "d"):
            bearer = {"Authorization": f"Bearer {await _issue_token(redis_client, f'throwaway-{account}')}"}
            statuses.append((await client.get("/export", headers=bearer)).status_code)
        # The anonymous per-IP bucket is separate from the signed-in ceiling.
        anonymous = (await client.get("/export")).status_code

    assert statuses == [200, 200, 200, 429]
    assert anonymous == 200
