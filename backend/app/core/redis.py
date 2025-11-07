"""Redis connection management."""

import logging
from typing import Any

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)


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
        await redis_client.pubsub().ping()
        logger.info("Redis client initialized and connected: %s:%s", settings.redis_host, settings.redis_port)

    except (TimeoutError, RedisError, OSError, ConnectionError) as e:
        logger.warning(
            "Failed to connect to Redis during initialization: %s. Application will continue without Redis.", e
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
    try:
        await redis_client.pubsub().ping()
    except (TimeoutError, RedisError, OSError) as e:
        logger.warning("Redis ping failed: %s", e)
        return False
    else:
        return True


async def get_redis_value(redis_client: Redis, key: str) -> str | None:
    """Get value from Redis.

    Args:
        redis_client: Redis client
        key: Redis key

    Returns:
        Value as string, or None if not found
    """
    try:
        return await redis_client.get(key)
    except (TimeoutError, RedisError, OSError):
        logger.exception("Failed to get Redis value for key %s.", key)
        return None


async def set_redis_value(redis_client: Redis, key: str, value: Any, ex: int | None = None) -> bool:
    """Set value in Redis.

    Args:
        redis_client: Redis client
        key: Redis key
        value: Value to stores
        ex: Expiration time in seconds (optional)

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        await redis_client.set(key, value, ex=ex)
    except (TimeoutError, RedisError, OSError):
        logger.exception("Failed to set Redis value for key %s.", key)
        return False
    else:
        return True


def get_redis_dependency(request: Request) -> Redis | None:
    """FastAPI dependency to get Redis client from app state.

    Args:
        request: FastAPI request object

    Returns:
        Redis client instance, or None if Redis is not available

    Usage:
        @app.get("/example")
        async def example(redis: Redis | None = Depends(get_redis_dependency)):
            if redis is None:
                raise HTTPException(status_code=503, detail="Redis is not available")
            await redis.get("key")
    """
    return request.app.state.redis
