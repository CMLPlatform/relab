"""Redis connection management."""

# spell-checker: ignore BLPOP, BRPOP
import logging
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, HTTPException, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import sanitize_log_value
from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from redis.typing import EncodableT

logger = logging.getLogger(__name__)


def _redis_from_request(request: Request) -> Redis | None:
    """Return the Redis client from app state when available."""
    return get_request_services(request).redis


async def _execute_redis_operation[T](
    operation_name: str,
    operation: Callable[[], Awaitable[T]],
    failure_result: T,
    *,
    log_key: str | None = None,
) -> T:
    """Run a Redis operation with consistent error handling."""
    try:
        return await operation()
    except TimeoutError, RedisError, OSError:
        if log_key is None:
            logger.exception("Redis %s failed.", operation_name)
        else:
            logger.exception("Redis %s failed for key %s.", operation_name, sanitize_log_value(log_key))
        return failure_result


async def init_redis() -> Redis | None:
    """Initialize Redis client instance with connection pooling.

    Returns:
        Redis: Async Redis client with connection pooling, or None if connection fails

    This should be called once during application startup.
    Gracefully handles connection failures and returns None if Redis is unavailable.
    """
    try:
        redis_client = Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password.get_secret_value() if settings.redis_password else None,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )

        # Verify connection on startup
        await redis_client.ping()  # ty: ignore[invalid-await] # ping is async in redis.asyncio, known issue with the Redis type annotations
        logger.info("Redis client initialized and connected: %s:%s", settings.redis_host, settings.redis_port)

    except (TimeoutError, RedisError, OSError, ConnectionError) as e:
        logger.warning(
            "Failed to connect to Redis during initialization: %s. Application will continue without Redis.", e
        )
        return None
    else:
        return redis_client


async def init_blocking_redis() -> Redis | None:
    """Initialize a Redis client for blocking commands (BLPOP/BRPOP).

    Identical to ``init_redis`` except ``socket_timeout`` is ``None`` so that
    blocking pops (BLPOP with large or zero timeout) are not interrupted by the
    socket-level timeout.  Use this client *only* for blocking operations; all
    other operations should use the regular client from ``init_redis``.
    """
    try:
        redis_client = Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password.get_secret_value() if settings.redis_password else None,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=None,  # must be None for BLPOP — a finite timeout kills the socket mid-wait
        )
        await redis_client.ping()  # ty: ignore[invalid-await]
        logger.info(
            "Blocking Redis client initialized and connected: %s:%s",
            settings.redis_host,
            settings.redis_port,
        )
    except (TimeoutError, RedisError, OSError, ConnectionError) as e:
        logger.warning(
            "Failed to connect to Redis (blocking client) during initialization: %s. "
            "Cross-worker relay will be unavailable.",
            e,
        )
        return None
    else:
        return redis_client


async def close_redis(redis_client: Redis) -> None:
    """Close Redis connection and connection pool.

    Args:
        redis_client: Redis client to close

    This properly closes all connections in the pool.
    """
    if redis_client:
        await redis_client.aclose()
        logger.info("Redis connection pool closed")


async def ping_redis(redis_client: Redis) -> bool:
    """Check if Redis is available (health check).

    Args:
        redis_client: Redis client to ping

    Returns:
        bool: True if Redis is responding, False otherwise

    This is useful for health check endpoints.
    """
    return await _execute_redis_operation("ping", redis_client.ping, failure_result=False)  # ty: ignore[invalid-argument-type] # ping is async in redis.asyncio, known issue with the Redis type annotations


async def get_redis_value(redis_client: Redis, key: str) -> str | None:
    """Get value from Redis.

    Args:
        redis_client: Redis client
        key: Redis key

    Returns:
        Value as string, or None if not found
    """
    return await _execute_redis_operation("get", lambda: redis_client.get(key), None, log_key=key)


async def set_redis_value(redis_client: Redis, key: str, value: EncodableT, ex: int | None = None) -> bool:
    """Set value in Redis.

    Args:
        redis_client: Redis client
        key: Redis key
        value: Value to store
        ex: Expiration time in seconds (optional)

    Returns:
        bool: True if successful, False otherwise
    """

    async def operation() -> bool:
        await redis_client.set(key, value, ex=ex)
        return True

    return await _execute_redis_operation("set", operation, failure_result=False, log_key=key)


async def delete_redis_key(redis_client: Redis, key: str) -> bool:
    """Delete a key from Redis.

    Args:
        redis_client: Redis client
        key: Redis key

    Returns:
        bool: True if successful, False otherwise
    """

    async def operation() -> bool:
        await redis_client.delete(key)
        return True

    return await _execute_redis_operation("delete", operation, failure_result=False, log_key=key)


def get_redis(request: Request) -> Redis:
    """FastAPI dependency to get the shared Redis client (raises if unavailable).

    Args:
        request: FastAPI request bound to the application's runtime services

    Returns:
        Redis client from the runtime service container

    Raises:
        RuntimeError: If Redis not initialized or unavailable
    """
    redis_client = _redis_from_request(request)

    if redis_client is None:
        msg = "Redis not available. Check Redis connection settings."
        raise RuntimeError(msg)

    return redis_client


# Type annotation for Redis dependency injection
RedisDep = Annotated[Redis, Depends(get_redis)]


def get_redis_optional(request: Request) -> Redis | None:
    """FastAPI dependency that returns Redis client or None without raising.

    Use this where Redis is optional (e.g. in development where Redis may be unavailable).
    """
    return _redis_from_request(request)


# Optional Redis dependency annotation
OptionalRedisDep = Annotated[Redis | None, Depends(get_redis_optional)]


def require_redis(redis_client: Redis | None) -> Redis:
    """Raise an HTTP-style error if Redis is unavailable."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis is required for this operation.")
    return redis_client
