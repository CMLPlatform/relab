"""Cache utilities for async functions and FastAPI endpoints.

This module keeps the app-facing cache API small and stable while using
``cashews`` underneath for storage and TTL handling.
"""
# spell-checker: ignore digestmod

from __future__ import annotations

import hashlib
import logging
from functools import wraps
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar, cast

from cashews import Cache
from cashews.exceptions import UnSecureDataError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")

_MEMORY_CACHE_BACKEND = "mem://"
_ETAG_WILDCARD = "*"
_SUCCESS_STATUS_MAX = 299
_CACHE_SIGNING_DIGEST = "sha256"
_MISSING = object()
_backend = Cache()
_cache_state = {"initialized": False}


_EXCLUDED_TYPES = (AsyncSession, Request, Response)


def _setup_cache_backend(backend_location: str) -> None:
    """Set up cashews with signed cache payloads."""
    cast("Any", _backend).setup(
        backend_location,
        secret=settings.cache_signing_secret.get_secret_value(),
        digestmod=_CACHE_SIGNING_DIGEST,
    )


def _get_cache_backend_location(redis_client: Redis | None) -> str:
    """Return the configured cache backend URL for the current runtime."""
    if not settings.enable_caching or redis_client is None:
        return _MEMORY_CACHE_BACKEND
    return settings.cache_url


def _log_cache_backend_selection(redis_client: Redis | None, backend_location: str) -> None:
    """Log the cache backend choice in one place."""
    if backend_location == _MEMORY_CACHE_BACKEND:
        if not settings.enable_caching:
            logger.info("Caching disabled in '%s' environment. Using in-memory backend.", settings.environment)
        elif redis_client is None:
            logger.warning("Endpoint cache initialized with in-memory backend - Redis unavailable")
        return

    logger.info("Endpoint cache initialized with Redis backend")


def cache_namespace(namespace: str = "") -> str:
    """Build a storage namespace under the configured cache prefix."""
    return f"{settings.cache.prefix}:{namespace}" if namespace else settings.cache.prefix


def make_key(namespace: str, *parts: object) -> str:
    """Build an exact cache key rooted under ``namespace``."""
    return ":".join([cache_namespace(namespace), *(str(part) for part in parts)])


async def _backend_get[T](key: str, *, default: T) -> T:
    """Read one cache value, treating failed signature checks as misses."""
    try:
        return await _backend.get(key, default=default)
    except UnSecureDataError:
        return default


async def cache_get[T](key: str, *, default: T | None = None) -> T | None:
    """Return an exact cache entry, or ``default`` when missing."""
    return await _backend_get(key, default=default)


async def cache_set[T](key: str, value: T, *, expire: int) -> None:
    """Store an exact cache entry."""
    await _backend.set(key, value, expire=expire)


async def cache_delete(key: str) -> None:
    """Delete an exact cache entry."""
    await _backend.delete(key)


async def cache_delete_pattern(pattern: str) -> None:
    """Delete cache entries matching a fully-qualified backend pattern."""
    await _backend.delete_match(pattern)


def _cache_key_excluding_dependencies(
    func: Callable[..., Any],
    namespace: str = "",
    *,
    request: Request | None = None,
    response: Response | None = None,
    args: tuple[Any, ...] = (),
    kwargs: dict[str, Any] | None = None,
) -> str:
    """Build cache key excluding dependency injection objects."""
    del request, response
    if kwargs is None:
        kwargs = {}

    filtered_kwargs = {k: v for k, v in kwargs.items() if not isinstance(v, _EXCLUDED_TYPES)}
    filtered_args = tuple(arg for arg in args if not isinstance(arg, _EXCLUDED_TYPES))
    module_name = getattr(func, "__module__", "")
    function_name = getattr(func, "__name__", func.__class__.__name__)
    cache_key_source = f"{module_name}:{function_name}:{filtered_args}:{filtered_kwargs}"
    cache_key = hashlib.sha1(cache_key_source.encode(), usedforsecurity=False).hexdigest()
    return f"{namespace}:{cache_key}"


def _etag_matches(if_none_match: str | None, current_etag: str | None) -> bool:
    """Return whether the request's ``If-None-Match`` header matches the cached ETag."""
    if if_none_match is None or current_etag is None:
        return False
    candidates = {candidate.strip() for candidate in if_none_match.split(",")}
    return _ETAG_WILDCARD in candidates or current_etag in candidates or f"W/{current_etag}" in candidates


def _cached_not_modified_response(request: Request | None, cached_value: object) -> Response | None:
    """Return a 304 response when a cached response already satisfies the client's ETag."""
    if request is None or not isinstance(cached_value, Response):
        return None

    current_etag = cached_value.headers.get("ETag")
    if not _etag_matches(request.headers.get("if-none-match"), current_etag):
        return None

    return Response(status_code=304, headers=dict(cached_value.headers))


def _cacheable_result(result: object) -> bool:
    """Return whether a function result should be stored as the canonical cached value."""
    return not isinstance(result, Response) or result.status_code <= _SUCCESS_STATUS_MAX


def cache(
    *,
    expire: int,
    namespace: str = "",
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Cache async endpoint/function results with ``cashews``."""

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            request = kwargs.get("request")
            if not isinstance(request, Request):
                request = next((arg for arg in args if isinstance(arg, Request)), None)

            key = _cache_key_excluding_dependencies(
                func,
                namespace=cache_namespace(namespace),
                args=args,
                kwargs=dict(kwargs),
            )
            cached_value = await _backend_get(key, default=_MISSING)
            if cached_value is not _MISSING:
                if response := _cached_not_modified_response(request, cast("T", cached_value)):
                    return cast("T", response)
                return cast("T", cached_value)

            result = await func(*args, **kwargs)
            if _cacheable_result(result):
                await cache_set(key, result, expire=expire)
            return result

        return wrapper

    return decorator


def init_cache(redis_client: Redis | None) -> None:
    """Initialize the shared cache backend."""
    if _cache_state["initialized"]:
        return

    backend_location = _get_cache_backend_location(redis_client)
    try:
        _setup_cache_backend(backend_location)
        _cache_state["initialized"] = True
        _log_cache_backend_selection(redis_client, backend_location)
    except OSError, RuntimeError, ValueError:
        logger.warning("Endpoint cache fell back to in-memory backend - Redis unavailable", exc_info=True)
        _setup_cache_backend(_MEMORY_CACHE_BACKEND)
        _cache_state["initialized"] = True


async def close_cache() -> None:
    """Close any open cache backend resources."""
    if not _cache_state["initialized"]:
        return

    await _backend.close()
    _cache_state["initialized"] = False


async def clear_cache_namespace(namespace: str) -> None:
    """Clear all cache entries for a specific namespace."""
    await cache_delete_pattern(f"{cache_namespace(namespace)}:*")
    logger.info("Cleared cache namespace: %s", sanitize_log_value(namespace))
