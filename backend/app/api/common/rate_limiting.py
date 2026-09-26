"""Lightweight rate limiter backed by the `limits` library.

Replaces the unmaintained slowapi package with a minimal implementation
that covers exactly the features this project uses: FastAPI route dependencies,
explicit service-level buckets, Redis-backed storage, and a fixed-window strategy.

Lives in ``common`` because every context rate-limits: auth owns only its own
login/register/verify/reset bucket sizes (``auth.services.rate_limiter``).
"""

import logging

import anyio.to_thread
from fastapi import Depends, Request
from fastapi.params import Depends as DependsParam
from fastapi.responses import JSONResponse
from limits import parse
from limits.storage import storage_from_string
from limits.strategies import FixedWindowRateLimiter
from redis.exceptions import RedisError

from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.config.core import settings as core_settings
from app.core.middleware.client_ip import get_client_ip
from app.core.pseudonyms import keyed_digest
from app.core.responses import build_problem_response

logger = logging.getLogger(__name__)


class RateLimitExceededError(Exception):
    """Raised when a client exceeds the configured rate limit."""

    def __init__(self, detail: str = "Rate limit exceeded") -> None:
        self.detail = detail
        super().__init__(detail)


def rate_limit_bucket_key(prefix: str, value: str) -> str:
    """Return a keyed digest bucket for sensitive rate-limit dimensions."""
    return f"{prefix}:{keyed_digest(prefix, value)}"


def request_ip_rate_limit_key(request: Request) -> str:
    """Return a privacy-preserving rate-limit key for the request client IP."""
    return rate_limit_bucket_key("client:ip", get_client_ip(request))


class Limiter:
    """Fixed-window rate limiter for per-IP FastAPI dependencies and explicit service buckets."""

    def __init__(self, *, storage_uri: str, enabled: bool = True) -> None:
        self.enabled = enabled
        self._limiter = FixedWindowRateLimiter(storage_from_string(storage_uri)) if enabled else None

    def hit_key(self, rate_string: str, key: str) -> None:
        """Enforce *rate_string* for an explicit bucket key.

        Fails open on a Redis backend outage: an unreachable rate limiter must not
        turn into a hard outage for login/register/pairing. The narrower risk (a
        few extra attempts during a Redis blip) is preferable to locking every
        user out of auth-adjacent endpoints.
        """
        if not self.enabled or self._limiter is None:
            return

        parsed = parse(rate_string)
        try:
            allowed = self._limiter.hit(parsed, key)
        except RedisError, ConnectionError, TimeoutError, OSError:
            logger.warning("Rate limiter backend unavailable; failing open for bucket %s", key)
            return

        if not allowed:
            # Safe to log: sensitive dimensions arrive as `prefix:<hmac-digest>`, never raw.
            logger.info("Rate limit exceeded for bucket %s", key)  # lgtm[py/clear-text-logging-sensitive-data]
            raise RateLimitExceededError

    async def ahit_key(self, rate_string: str, key: str) -> None:
        """Async ``hit_key`` for callers already on the event loop.

        The ``limits`` Redis backend is synchronous (its async backend would pull in a
        second Redis client, coredis), so a direct call from an async handler blocks the
        event loop on every login/reset/pairing attempt, a cheap DoS lever under load.
        Offloading to a worker thread keeps the loop free, exactly as FastAPI already does
        for the sync ``dependency`` path. Sync callers (that path) must not use this.
        """
        await anyio.to_thread.run_sync(self.hit_key, rate_string, key)

    def dependency(self, rate_string: str, *, name: str = "rate_limit") -> DependsParam:
        """Return a FastAPI dependency that enforces *rate_string* per client IP."""

        def dependency(request: Request) -> None:
            self.hit_key(rate_string, request_ip_rate_limit_key(request))

        dependency.__name__ = name
        return Depends(dependency)


def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a 429 JSON response for rate-limited requests."""
    detail = exc.detail if isinstance(exc, RateLimitExceededError) else "Rate limit exceeded"
    audit_event(
        None,
        AuditAction.RATE_LIMITED,
        "http_request",
        request.url.path,
        context=AuditContext(outcome="denied", status_code=429),
    )
    return build_problem_response(
        request=request,
        status_code=429,
        detail=detail,
        code="RateLimitExceeded",
        type_="https://httpstatuses.com/429",
    )


# Singleton limiter instance and rate-limit strings

limiter = Limiter(storage_uri=core_settings.redis.cache_url, enabled=core_settings.enable_rate_limit)

API_READ_RATE_LIMIT_DEPENDENCY = limiter.dependency(core_settings.api_read_rate_limit, name="api_read_rate_limit")
API_WRITE_RATE_LIMIT_DEPENDENCY = limiter.dependency(core_settings.api_write_rate_limit, name="api_write_rate_limit")
API_UPLOAD_RATE_LIMIT_DEPENDENCY = limiter.dependency(core_settings.api_upload_rate_limit, name="api_upload_rate_limit")
