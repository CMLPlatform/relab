"""Lightweight rate limiter backed by the `limits` library.

Replaces the unmaintained slowapi package with a minimal implementation
that covers exactly the features this project uses: FastAPI route dependencies,
explicit service-level buckets, Redis-backed storage, and a fixed-window strategy.

Lives in ``common`` because every context rate-limits. Auth owns its own bucket sizes
and, because it owns identity, the per-user API limits (``auth.services.rate_limiter``).
"""

import functools
import logging
import math
import time
from collections.abc import Awaitable, Callable

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

    def __init__(self, detail: str = "Rate limit exceeded", *, retry_after: int | None = None) -> None:
        self.detail = detail
        self.retry_after = retry_after
        super().__init__(detail)


def rate_limit_bucket_key(prefix: str, value: str) -> str:
    """Return a keyed digest bucket for sensitive rate-limit dimensions."""
    return f"{prefix}:{keyed_digest(prefix, value)}"


def request_ip_rate_limit_key(request: Request) -> str:
    """Return a privacy-preserving rate-limit key for the request client IP."""
    return rate_limit_bucket_key("client:ip", get_client_ip(request))


type RequestUserId = Callable[[Request], Awaitable[str | None]]
"""Resolve the signed-in user id of a request, or None. Supplied by auth, which owns identity."""


class Limiter:
    """Fixed-window rate limiter for per-IP or per-user FastAPI dependencies and explicit buckets."""

    def __init__(self, *, storage_uri: str, enabled: bool = True) -> None:
        self.enabled = enabled
        self._limiter = FixedWindowRateLimiter(storage_from_string(storage_uri)) if enabled else None

    def hit_key(self, rate_string: str, key: str, *, consume: bool = True) -> None:
        """Enforce *rate_string* for an explicit bucket key.

        ``consume=False`` only checks the bucket, for budgets that count some outcomes,
        such as failed logins: check before the work, hit only when the outcome counts.

        Fails open on a Redis backend outage: an unreachable rate limiter must not
        turn into a hard outage for login/register/pairing. The narrower risk (a
        few extra attempts during a Redis blip) is preferable to locking every
        user out of auth-adjacent endpoints.
        """
        if not self.enabled or self._limiter is None:
            return

        parsed = parse(rate_string)
        try:
            allowed = (self._limiter.hit if consume else self._limiter.test)(parsed, key)
        except RedisError, ConnectionError, TimeoutError, OSError:
            logger.warning("Rate limiter backend unavailable; failing open for bucket %s", key)
            return

        if not allowed:
            # Safe to log: sensitive dimensions arrive as `prefix:<hmac-digest>`, never raw.
            logger.info("Rate limit exceeded for bucket %s", key)  # lgtm[py/clear-text-logging-sensitive-data]
            try:
                reset_time = self._limiter.get_window_stats(parsed, key).reset_time
            except RedisError, ConnectionError, TimeoutError, OSError:
                raise RateLimitExceededError from None
            raise RateLimitExceededError(retry_after=max(1, math.ceil(reset_time - time.time())))

    async def ahit_key(self, rate_string: str, key: str, *, consume: bool = True) -> None:
        """Async ``hit_key`` for callers already on the event loop.

        The ``limits`` Redis backend is synchronous (its async backend would pull in a
        second Redis client, coredis), so a direct call from an async handler blocks the
        event loop on every login/reset/pairing attempt, a cheap DoS lever under load.
        Offloading to a worker thread keeps the loop free; route dependencies use it too.
        Sync callers must use ``hit_key`` instead.
        """
        await anyio.to_thread.run_sync(functools.partial(self.hit_key, rate_string, key, consume=consume))

    def dependency(
        self,
        rate_string: str,
        *,
        name: str = "rate_limit",
        per_user: tuple[str, RequestUserId] | None = None,
        signed_in_ip_ceiling: str | None = None,
    ) -> DependsParam:
        """Return a FastAPI dependency that enforces *rate_string* per client IP.

        With ``per_user=(rate, user_id_of)``, a signed-in request is counted against that
        rate in its user's bucket instead, so people sharing one IP (a classroom behind one
        NAT) do not share one budget. Without it, every request is keyed per IP, which is
        what the login and signup routes want.

        ``signed_in_ip_ceiling`` also charges signed-in requests to a per-IP bucket of their
        own, so a stack of throwaway accounts on one IP cannot multiply the per-user budget.
        """

        async def dependency(request: Request) -> None:
            if not self.enabled:
                return
            if per_user is None:
                await self.ahit_key(rate_string, request_ip_rate_limit_key(request))
                return
            user_rate_string, user_id_of = per_user
            # No user id, or a Redis error resolving one, keeps the IP bucket, so rotating junk
            # tokens never buys a fresh budget. The id only picks a bucket, never grants access.
            try:
                user_id = await user_id_of(request)
            except RedisError, ConnectionError, TimeoutError, OSError:
                user_id = None
            if user_id is None:
                await self.ahit_key(rate_string, request_ip_rate_limit_key(request))
            else:
                await self.ahit_key(user_rate_string, rate_limit_bucket_key("client:user", user_id))
                if signed_in_ip_ceiling is not None:
                    ip_key = rate_limit_bucket_key("client:ip:signed-in", get_client_ip(request))
                    await self.ahit_key(signed_in_ip_ceiling, ip_key)

        dependency.__name__ = name
        return Depends(dependency)


def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a 429 JSON response for rate-limited requests."""
    detail = exc.detail if isinstance(exc, RateLimitExceededError) else "Rate limit exceeded"
    retry_after = exc.retry_after if isinstance(exc, RateLimitExceededError) else None
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
        headers=None if retry_after is None else {"Retry-After": str(retry_after)},
    )


# Singleton limiter instance

limiter = Limiter(storage_uri=core_settings.redis.cache_url, enabled=core_settings.enable_rate_limit)
