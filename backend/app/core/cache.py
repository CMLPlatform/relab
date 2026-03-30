"""Cache utilities for FastAPI endpoints and async methods.

This module keeps the app-facing cache API small and stable while using
``cashews`` underneath for storage and TTL handling.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import wraps
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar, overload

from cashews import Cache
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from cachetools import TTLCache
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")

_HTML_RESPONSE_TYPE = "HTMLResponse"
_MISSING = object()
_backend = Cache()
_cache_state = {"initialized": False}

JSONValue = HTMLResponse | dict[str, Any] | list[Any] | str | float | bool | None


class Coder:
    """Minimal coder interface for custom cache serialization."""

    @classmethod
    def encode(cls, value: Any) -> bytes:  # noqa: ANN401
        """Encode a Python value to bytes."""
        raise NotImplementedError

    @classmethod
    def decode(cls, value: bytes | str) -> Any:  # noqa: ANN401
        """Decode bytes or strings into a Python value."""
        raise NotImplementedError


class HTMLCoder(Coder):
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

    @overload
    @classmethod
    def decode_as_type(cls, value: bytes | str, type_: type[T]) -> T: ...

    @overload
    @classmethod
    def decode_as_type(cls, value: bytes | str, type_: None = None) -> JSONValue: ...

    @classmethod
    def decode_as_type(cls, value: bytes | str, type_: type[T] | None = None) -> T | JSONValue:  # noqa: ARG003
        """Decode bytes to the specified type."""
        return cls.decode(value)


_EXCLUDED_TYPES = (AsyncSession, Request, Response)


def _cache_namespace(namespace: str = "") -> str:
    """Build a storage namespace under the configured cache prefix."""
    return f"{settings.cache.prefix}:{namespace}" if namespace else settings.cache.prefix


def key_builder_excluding_dependencies(
    func: Callable[..., Any],
    namespace: str = "",
    *,
    request: Request | None = None,  # noqa: ARG001
    response: Response | None = None,  # noqa: ARG001
    args: tuple[Any, ...] = (),
    kwargs: dict[str, Any] | None = None,
) -> str:
    """Build cache key excluding dependency injection objects."""
    if kwargs is None:
        kwargs = {}

    filtered_kwargs = {k: v for k, v in kwargs.items() if not isinstance(v, _EXCLUDED_TYPES)}
    filtered_args = tuple(arg for arg in args if not isinstance(arg, _EXCLUDED_TYPES))
    module_name = getattr(func, "__module__", "")
    function_name = getattr(func, "__name__", func.__class__.__name__)
    cache_key_source = f"{module_name}:{function_name}:{filtered_args}:{filtered_kwargs}"
    cache_key = hashlib.sha1(cache_key_source.encode(), usedforsecurity=False).hexdigest()
    return f"{namespace}:{cache_key}"


def cache(
    *,
    expire: int,
    namespace: str = "",
    coder: type[Coder] | None = None,
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Cache async endpoint/function results with ``cashews``."""

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            key = key_builder_excluding_dependencies(
                func,
                namespace=_cache_namespace(namespace),
                args=args,
                kwargs=dict(kwargs),
            )
            cached_value = await _backend.get(key, default=_MISSING)
            if cached_value is not _MISSING:
                if coder is not None:
                    return coder.decode(cached_value)
                return cached_value

            result = await func(*args, **kwargs)
            value_to_store = coder.encode(result) if coder is not None else result
            await _backend.set(key, value_to_store, expire=expire)
            return result

        return wrapper

    return decorator


def async_ttl_cache(cache: TTLCache) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Simple async cache decorator using cachetools.TTLCache."""

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            key = (args, tuple(sorted(kwargs.items())))
            if key in cache:
                return cache[key]

            result = await func(*args, **kwargs)
            cache[key] = result
            return result

        return wrapper

    return decorator


def init_fastapi_cache(redis_client: Redis | None) -> None:
    """Initialize the shared cache backend for endpoint caching."""
    if _cache_state["initialized"]:
        return

    if not settings.enable_caching:
        logger.info("Caching disabled in '%s' environment. Using in-memory backend.", settings.environment)
        _backend.setup("mem://")
        _cache_state["initialized"] = True
        return

    if redis_client is None:
        logger.warning("Endpoint cache initialized with in-memory backend - Redis unavailable")
        _backend.setup("mem://")
        _cache_state["initialized"] = True
        return

    try:
        _backend.setup(settings.cache_url)
        _cache_state["initialized"] = True
        logger.info("Endpoint cache initialized with Redis backend")
    except (OSError, RuntimeError, ValueError):  # pragma: no cover - defensive fallback
        logger.warning("Endpoint cache fell back to in-memory backend - Redis unavailable", exc_info=True)
        _backend.setup("mem://")
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
