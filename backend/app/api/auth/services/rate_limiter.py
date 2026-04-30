"""Lightweight rate limiter backed by the `limits` library.

Replaces the unmaintained slowapi package with a minimal implementation
that covers exactly the features this project uses: a per-route ``@limiter.limit()``
decorator, Redis-backed storage, and a fixed-window strategy.
"""

from __future__ import annotations

import functools
import logging
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar

from fastapi import Request
from fastapi.responses import JSONResponse
from limits import parse
from limits.storage import storage_from_string
from limits.strategies import STRATEGIES

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings
from app.core.middleware.client_ip import get_client_ip
from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Mapping

P = ParamSpec("P")
R = TypeVar("R")

logger = logging.getLogger(__name__)


class RateLimitExceededError(Exception):
    """Raised when a client exceeds the configured rate limit."""

    def __init__(self, detail: str = "Rate limit exceeded") -> None:
        self.detail = detail
        super().__init__(detail)


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

    def limit(
        self, rate_string: str
    ) -> Callable[[Callable[P, Coroutine[Any, Any, R]]], Callable[P, Coroutine[Any, Any, R]]]:
        """Decorator that enforces *rate_string* on an async endpoint."""
        parsed = parse(rate_string)

        def decorator(
            func: Callable[P, Coroutine[Any, Any, R]],
        ) -> Callable[P, Coroutine[Any, Any, R]]:
            @functools.wraps(func)
            async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
                if self.enabled:
                    limiter = self._limiter
                    request = _find_request(args, kwargs)
                    if request is not None and limiter is not None:
                        key = self._key_func(request)
                        if not limiter.hit(parsed, key):
                            logger.info("Rate limit exceeded for key %s", key)
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
            logger.info("Rate limit exceeded for key %s", key)
            raise RateLimitExceededError


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
    key_func=get_client_ip,
    storage_uri=core_settings.cache_url,
    strategy="fixed-window",
    enabled=core_settings.enable_rate_limit,
)

LOGIN_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts_per_minute}/minute"
REGISTER_RATE_LIMIT = f"{auth_settings.rate_limit_register_attempts_per_hour}/hour"
VERIFY_RATE_LIMIT = f"{auth_settings.rate_limit_verify_attempts_per_hour}/hour"
PASSWORD_RESET_RATE_LIMIT = f"{auth_settings.rate_limit_password_reset_attempts_per_hour}/hour"
