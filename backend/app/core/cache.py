"""Cache utilities for FastAPI endpoints and async methods.

This module provides:
- Optimized cache key builders for fastapi-cache that handle dependency injection
- Async cache decorators for instance methods using cachetools
"""

import hashlib
import json
import logging
from functools import wraps
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar, overload

from fastapi.responses import HTMLResponse
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.coder import Coder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from cachetools import TTLCache
    from redis.asyncio import Redis
    from starlette.requests import Request
    from starlette.responses import Response

logger = logging.getLogger(__name__)

# Type variables for generic decorator
P = ParamSpec("P")
T = TypeVar("T")

# HTML coder constants
_HTML_RESPONSE_TYPE = "HTMLResponse"

# JSON-compatible types for encoding/decoding
JSONValue = HTMLResponse | dict[str, Any] | list[Any] | str | float | bool | None


class HTMLCoder(Coder):
    """Custom coder for caching HTMLResponse objects.

    This coder handles serialization and deserialization of HTMLResponse objects
    by extracting the HTML body content and storing it with metadata for reconstruction.
    """

    @classmethod
    def encode(cls, value: JSONValue) -> bytes:
        """Encode value to bytes, handling HTMLResponse objects specially."""
        if isinstance(value, HTMLResponse):
            # Extract body from HTMLResponse and encode with metadata
            data: dict[str, Any] = {
                "type": _HTML_RESPONSE_TYPE,
                "body": value.body.decode("utf-8") if isinstance(value.body, bytes) else value.body,
                "status_code": value.status_code,
                "media_type": value.media_type,
                "headers": dict(value.headers),
            }
            return json.dumps(data).encode("utf-8")
        # For non-HTMLResponse objects, use default JSON encoding
        return json.dumps(value).encode("utf-8")

    @classmethod
    def decode(cls, value: bytes | str) -> JSONValue:
        """Decode bytes to Python object, reconstructing HTMLResponse objects."""
        # Handle both bytes and string inputs (string occurs on cache retrieval)
        if isinstance(value, bytes):
            value = value.decode("utf-8")

        data = json.loads(value)

        # Reconstruct HTMLResponse if that's what was cached
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
    def decode_as_type(cls, value: bytes | str, type_: type[T] | None = None) -> T | JSONValue:  # noqa: ARG003 # Argument is unused but expected by parent class
        """Decode bytes to the specified type, handling HTMLResponse reconstruction.

        Note: type_ parameter is currently unused but kept for interface compatibility with Coder base class.
        """
        return cls.decode(value)


# Pre-compile the set of types to exclude from cache key generation
# These are dependency injection instances that vary per request
_EXCLUDED_TYPES = (AsyncSession,)


def key_builder_excluding_dependencies(
    func: Callable[..., Any],
    namespace: str = "",
    *,
    request: Request | None = None,  # noqa: ARG001 # request is expected by fastapi-cache but not used in key generation
    response: Response | None = None,  # noqa: ARG001 # response is expected by fastapi-cache but not used in key generation
    args: tuple[Any, ...] = (),
    kwargs: dict[str, Any] | None = None,
) -> str:
    """Build cache key excluding dependency injection objects.

    This key builder filters out database sessions and other injected
    dependencies that should not affect the cache key, preventing
    different instances from creating different keys for identical requests.

    Args:
        func: The cached function
        namespace: Cache namespace prefix
        request: HTTP request object (optional)
        response: HTTP response object (optional)
        args: Positional arguments to the function
        kwargs: Keyword arguments to the function

    Returns:
        Cache key string in format: {namespace}:{hash}
    """
    if kwargs is None:
        kwargs = {}

    # Filter out dependency injection instances
    # This is more efficient than checking isinstance for each value
    filtered_kwargs = {k: v for k, v in kwargs.items() if not isinstance(v, _EXCLUDED_TYPES)}

    # Build cache key from function identity and filtered parameters
    # Using sha1 is faster than sha256 and sufficient for cache keys
    module_name = getattr(func, "__module__", "")
    function_name = getattr(func, "__name__", func.__class__.__name__)
    cache_key_source = f"{module_name}:{function_name}:{args}:{filtered_kwargs}"
    cache_key = hashlib.sha1(cache_key_source.encode(), usedforsecurity=False).hexdigest()

    return f"{namespace}:{cache_key}"


def async_ttl_cache(cache: TTLCache) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Simple async cache decorator using cachetools.TTLCache.

    This decorator caches the results of async methods/functions with automatic
    expiration based on the TTL (time-to-live) configured in the cache.

    Perfect for per-instance caching where Redis would be overkill, such as:
    - Short-lived status checks
    - External API calls with brief validity
    - Computed properties that change infrequently

    Args:
        cache: A TTLCache instance to use for caching results

    Returns:
        Decorator function for async methods/functions

    Example:
        ```python
        from cachetools import TTLCache
        from app.core.cache import async_ttl_cache


        class Service:
            @async_ttl_cache(TTLCache(maxsize=1, ttl=15))
            async def get_status(self) -> dict:
                # Expensive operation cached for 15 seconds
                return await self._fetch_status()
        ```
    """

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Create cache key from function args
            key = (args, tuple(sorted(kwargs.items())))

            # Check if result is in cache
            if key in cache:
                return cache[key]

            # Call function and cache result
            result = await func(*args, **kwargs)
            cache[key] = result
            return result

        return wrapper

    return decorator


def init_fastapi_cache(redis_client: Redis | None) -> None:
    """Initialize FastAPI Cache with Redis backend and optimized key builder.

    This function sets up the FastAPI Cache to use Redis for caching and
    configures it to use the custom key builder that excludes dependency
    injection objects from cache keys.

    Args:
        redis_client: An instance of a Redis client (e.g., aioredis.Redis)
    """
    prefix = settings.cache.prefix

    if not settings.enable_caching:
        logger.info("Caching disabled in '%s' environment. Using InMemoryBackend.", settings.environment)
        FastAPICache.init(InMemoryBackend(), prefix=prefix, key_builder=key_builder_excluding_dependencies)
        return

    if redis_client:
        FastAPICache.init(RedisBackend(redis_client), prefix=prefix, key_builder=key_builder_excluding_dependencies)
        logger.info("FastAPI Cache initialized with Redis backend")
    else:
        FastAPICache.init(InMemoryBackend(), prefix=prefix, key_builder=key_builder_excluding_dependencies)
        logger.warning("FastAPI Cache initialized with in-memory backend - Redis unavailable")


async def clear_cache_namespace(namespace: str) -> None:
    """Clear all cache entries for a specific namespace.

    Args:
        namespace: Cache namespace to clear (e.g., "background-data", "docs")
    """
    await FastAPICache.clear(namespace=namespace)
    logger.info("Cleared cache namespace: %s", sanitize_log_value(namespace))
