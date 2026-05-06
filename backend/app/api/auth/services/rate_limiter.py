"""Lightweight rate limiter backed by the `limits` library.

Replaces the unmaintained slowapi package with a minimal implementation
that covers exactly the features this project uses: a per-route ``@limiter.limit()``
decorator, FastAPI route dependencies, Redis-backed storage, and a fixed-window
strategy.
"""

from __future__ import annotations

import functools
import hashlib
import hmac
import logging
from typing import TYPE_CHECKING, ParamSpec, TypeVar

from fastapi import Depends, Request
from fastapi.params import Depends as DependsParam
from fastapi.responses import JSONResponse
from limits import parse
from limits.storage import storage_from_string
from limits.strategies import STRATEGIES

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings
from app.core.middleware.client_ip import get_client_ip
from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Mapping

P = ParamSpec("P")
R = TypeVar("R")

logger = logging.getLogger(__name__)


class RateLimitExceededError(Exception):
    """Raised when a client exceeds the configured rate limit."""

    def __init__(self, detail: str = "Rate limit exceeded") -> None:
        self.detail = detail
        super().__init__(detail)


def rate_limit_bucket_key(prefix: str, value: str) -> str:
    """Return a keyed digest bucket for sensitive rate-limit dimensions."""
    normalized_value = value.strip().casefold()
    if not normalized_value:
        return f"{prefix}:missing"
    secret = auth_settings.auth_token_secret.get_secret_value().encode("utf-8")
    digest = hmac.new(secret, normalized_value.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{prefix}:{digest}"


def request_ip_rate_limit_key(request: Request) -> str:
    """Return a privacy-preserving rate-limit key for the request client IP."""
    return rate_limit_bucket_key("client:ip", get_client_ip(request))


class Limiter:
    """Minimal rate limiter compatible with FastAPI route decorators."""

    def __init__(
        self,
        *,
        key_func: Callable[[Request], str],
        storage_uri: str,
        strategy: str = "fixed-window",
        enabled: bool = True,
    ) -> None:
        self._key_func = key_func
        self.enabled = enabled
        if enabled:
            self._storage = storage_from_string(storage_uri)
            self._limiter = STRATEGIES[strategy](self._storage)
        else:
            self._storage = None
            self._limiter = None

    def limit(self, rate_string: str) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
        """Decorator that enforces *rate_string* on an async endpoint."""
        parsed = parse(rate_string)

        def decorator(
            func: Callable[P, Awaitable[R]],
        ) -> Callable[P, Awaitable[R]]:
            @functools.wraps(func)
            async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
                if self.enabled:
                    limiter = self._limiter
                    request = _find_request(args, kwargs)
                    if request is not None and limiter is not None:
                        key = self._key_func(request)
                        if not limiter.hit(parsed, key):
                            logger.info("Rate limit exceeded for bucket %s", key)
                            raise RateLimitExceededError
                return await func(*args, **kwargs)

            return wrapper

        return decorator

    def hit_key(self, rate_string: str, key: str) -> None:
        """Enforce *rate_string* for an explicit bucket key."""
        if not self.enabled or self._limiter is None:
            return

        parsed = parse(rate_string)
        if not self._limiter.hit(parsed, key):
            logger.info("Rate limit exceeded for bucket %s", key)
            raise RateLimitExceededError

    def hit_request(self, rate_string: str, request: Request) -> None:
        """Enforce *rate_string* for a FastAPI request."""
        self.hit_key(rate_string, self._key_func(request))

    def dependency(self, rate_string: str, *, name: str = "rate_limit") -> DependsParam:
        """Return a FastAPI dependency that enforces *rate_string* for a request."""

        def dependency(request: Request) -> None:
            self.hit_request(rate_string, request)

        dependency.__name__ = name
        return Depends(dependency)


def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a 429 JSON response for rate-limited requests."""
    detail = exc.detail if isinstance(exc, RateLimitExceededError) else "Rate limit exceeded"
    return build_problem_response(
        request=request,
        status_code=429,
        detail=detail,
        code="RateLimitExceeded",
        type_="https://httpstatuses.com/429",
    )


def _find_request(args: tuple[object, ...], kwargs: Mapping[str, object]) -> Request | None:
    """Extract the ``Request`` instance from endpoint arguments."""
    for val in (*args, *kwargs.values()):
        if isinstance(val, Request):
            return val
    return None


# ---------------------------------------------------------------------------
# Singleton limiter instance & rate-limit strings
# ---------------------------------------------------------------------------

limiter = Limiter(
    key_func=request_ip_rate_limit_key,
    storage_uri=core_settings.cache_url,
    strategy="fixed-window",
    enabled=core_settings.enable_rate_limit,
)

LOGIN_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts_per_minute}/minute"
REGISTER_RATE_LIMIT = f"{auth_settings.rate_limit_register_attempts_per_hour}/hour"
VERIFY_RATE_LIMIT = f"{auth_settings.rate_limit_verify_attempts_per_hour}/hour"
PASSWORD_RESET_RATE_LIMIT = f"{auth_settings.rate_limit_password_reset_attempts_per_hour}/hour"
API_READ_RATE_LIMIT_DEPENDENCY = limiter.dependency(core_settings.api_read_rate_limit, name="api_read_rate_limit")
API_UPLOAD_RATE_LIMIT_DEPENDENCY = limiter.dependency(core_settings.api_upload_rate_limit, name="api_upload_rate_limit")
