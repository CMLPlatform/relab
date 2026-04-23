"""Cache utilities for FastAPI endpoints and async methods.

This module keeps the app-facing cache API small and stable while using
``cashews`` underneath for storage and TTL handling.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import wraps
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar, cast

from cashews import Cache
from fastapi.responses import HTMLResponse
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

_HTML_RESPONSE_TYPE = "HTMLResponse"
_MEMORY_CACHE_BACKEND = "mem://"
_ETAG_WILDCARD = "*"
_MISSING = object()
_backend = Cache()
_cache_state = {"initialized": False}

JSONValue = HTMLResponse | dict[str, Any] | list[Any] | str | float | bool | None


class HTMLCoder:
    """Custom coder for caching HTMLResponse objects."""

    @classmethod
    def encode(cls, value: JSONValue) -> bytes:
        """Encode value to bytes, handling HTMLResponse objects specially."""
        if isinstance(value, HTMLResponse):
            data: dict[str, Any] = {
                "type": _HTML_RESPONSE_TYPE,
                "body": value.body.decode("utf-8") if isinstance(value.body, bytes) else value.body,
                "status_code": value.status_code,
                "media_type": value.media_type,
                "headers": dict(value.headers),
            }
            return json.dumps(data).encode("utf-8")
        return json.dumps(value).encode("utf-8")

    @classmethod
    def decode(cls, value: bytes | str) -> JSONValue:
        """Decode bytes to Python object, reconstructing HTMLResponse objects."""
        if isinstance(value, bytes):
            value = value.decode("utf-8")

        data = json.loads(value)
        if isinstance(data, dict) and data.get("type") == _HTML_RESPONSE_TYPE:
            return HTMLResponse(
                content=data["body"],
                status_code=data.get("status_code", 200),
                media_type=data.get("media_type", "text/html"),
                headers=data.get("headers"),
            )
        return data


_EXCLUDED_TYPES = (AsyncSession, Request, Response)


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


async def _get_cached_result(key: str, coder: type[HTMLCoder] | None) -> T | JSONValue | object:
    """Read and decode a cached result when present."""
    cached_value = await _backend.get(key, default=_MISSING)
    if cached_value is _MISSING:
        return _MISSING
    if coder is not None:
        return coder.decode(cast("bytes | str", cached_value))
    return cast("T", cached_value)


async def _set_cached_result[T](key: str, result: T, *, expire: int, coder: type[HTMLCoder] | None) -> None:
    """Encode and store a cached result."""
    value_to_store = coder.encode(cast("JSONValue", result)) if coder is not None else result
    await _backend.set(key, value_to_store, expire=expire)


def _cache_namespace(namespace: str = "") -> str:
    """Build a storage namespace under the configured cache prefix."""
    return f"{settings.cache.prefix}:{namespace}" if namespace else settings.cache.prefix


def key_builder_excluding_dependencies(
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


def cache(
    *,
    expire: int,
    namespace: str = "",
    coder: type[HTMLCoder] | None = None,
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Cache async endpoint/function results with ``cashews``."""

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            request = kwargs.get("request")
            if not isinstance(request, Request):
                request = next((arg for arg in args if isinstance(arg, Request)), None)

            key = key_builder_excluding_dependencies(
                func,
                namespace=_cache_namespace(namespace),
                args=args,
                kwargs=dict(kwargs),
            )
            cached_value = await _get_cached_result(key, coder)
            if cached_value is not _MISSING:
                if response := _cached_not_modified_response(request, cast("T", cached_value)):
                    return cast("T", response)
                return cast("T", cached_value)

            result = await func(*args, **kwargs)
            await _set_cached_result(key, result, expire=expire, coder=coder)
            return result

        return wrapper

    return decorator


def init_fastapi_cache(redis_client: Redis | None) -> None:
    """Initialize the shared cache backend for endpoint caching."""
    if _cache_state["initialized"]:
        return

    backend_location = _get_cache_backend_location(redis_client)
    try:
        _backend.setup(backend_location)
        _cache_state["initialized"] = True
        _log_cache_backend_selection(redis_client, backend_location)
    except OSError, RuntimeError, ValueError:
        logger.warning("Endpoint cache fell back to in-memory backend - Redis unavailable", exc_info=True)
        _backend.setup(_MEMORY_CACHE_BACKEND)
        _cache_state["initialized"] = True


async def close_fastapi_cache() -> None:
    """Close any open cache backend resources."""
    if not _cache_state["initialized"]:
        return

    await _backend.close()
    _cache_state["initialized"] = False


async def clear_cache_namespace(namespace: str) -> None:
    """Clear all cache entries for a specific namespace."""
    await _backend.delete_match(f"{_cache_namespace(namespace)}:*")
    logger.info("Cleared cache namespace: %s", sanitize_log_value(namespace))
