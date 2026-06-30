"""Redis connection management."""
# spell-checker: ignore BLPOP, BRPOP, coro

import logging
import ssl
from typing import TYPE_CHECKING, Annotated, Any

from fastapi import Depends, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import sanitize_log_value
from app.core.runtime import get_request_services, require_redis

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from redis.typing import EncodableT

logger = logging.getLogger(__name__)


# Typed adapters for redis-py async operations.
#
# ``redis-py``'s methods are declared ``ResponseT = Any | Awaitable[Any]`` — the stubs don't
# narrow by sync-vs-async client. These adapters await-and-coerce, centralizing the upstream
# stub gap. ``coro: Any`` is deliberate; the helpers hide it from call sites.


async def redis_bool(coro: Any) -> bool:  # noqa: ANN401 — upstream stub gap
    """Await a redis-py coroutine and coerce the result to ``bool``."""
    return bool(await coro)


async def redis_int(coro: Any) -> int:  # noqa: ANN401
    """Await a redis-py coroutine and coerce the result to ``int``."""
    return int(await coro)


async def redis_str_set(coro: Any) -> set[str]:  # noqa: ANN401
    """Await a redis-py SMEMBERS-style coroutine and return a ``set[str]``."""
    result = await coro
    return set(result) if result else set()


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


async def init_redis() -> Redis:
    """Initialize Redis client instance with connection pooling.

    Returns:
        Redis: Async Redis client with connection pooling.

    This should be called once during application startup.
    """
    try:
        redis_cfg = settings.redis
        password = redis_cfg.password.get_secret_value() if redis_cfg.password else None
        if redis_cfg.tls:
            redis_client = Redis(
                host=redis_cfg.host,
                port=redis_cfg.port,
                db=redis_cfg.db,
                password=password,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                ssl=True,
                ssl_cert_reqs=ssl.CERT_REQUIRED,
                ssl_ca_certs=str(redis_cfg.tls_ca_file) if redis_cfg.tls_ca_file is not None else None,
                ssl_check_hostname=True,
            )
        else:
            redis_client = Redis(
                host=redis_cfg.host,
                port=redis_cfg.port,
                db=redis_cfg.db,
                password=password,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                ssl=False,
            )

        # Verify connection on startup
        await redis_bool(redis_client.ping())
        logger.info("Redis client initialized and connected: %s:%s", redis_cfg.host, redis_cfg.port)

    except (TimeoutError, RedisError, OSError, ConnectionError) as e:
        logger.warning("Failed to connect to Redis during initialization: %s.", e)
        msg = "Redis is required during application startup."
        raise RuntimeError(msg) from e
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
    return await _execute_redis_operation(
        "ping",
        lambda: redis_bool(redis_client.ping()),
        failure_result=False,
    )


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


async def set_redis_value_nx(redis_client: Redis, key: str, value: EncodableT, ex: int | None = None) -> bool:
    """Set value in Redis only if the key does not already exist (atomic SET NX EX).

    Returns True if the value was stored, False if the key already existed or the
    operation failed.
    """

    async def operation() -> bool:
        result = await redis_client.set(key, value, ex=ex, nx=True)
        return bool(result)

    return await _execute_redis_operation("set_nx", operation, failure_result=False, log_key=key)


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
        ServiceUnavailableError: If Redis is not initialized or unavailable.
    """
    return require_redis(get_request_services(request).redis)


# Type annotation for Redis dependency injection
RedisDep = Annotated[Redis, Depends(get_redis)]
