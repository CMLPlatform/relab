"""Circuit breaker for cross-worker WebSocket relay attempts.

State lives only in Redis: a per-camera failure counter with a cooldown TTL.
The circuit opens once the counter reaches the threshold and half-opens
automatically when the key expires. Redis outages fail open (relay attempts
proceed) so the breaker never blocks traffic on its own infrastructure.
"""

import contextlib
import logging
from typing import TYPE_CHECKING

from pydantic import UUID4
from redis.exceptions import RedisError

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD = 3
COOL_DOWN_S = 30.0


def _redis_key(camera_id: UUID4) -> str:
    return f"rpi_cam:cb:{camera_id}"


async def is_open(camera_id: UUID4, redis: Redis) -> bool:
    """Return True if the cross-worker circuit for ``camera_id`` is currently open."""
    try:
        failures = await redis.get(_redis_key(camera_id))
    except TimeoutError, RedisError, OSError, ConnectionError:
        return False
    return failures is not None and int(failures) >= FAILURE_THRESHOLD


async def record_success(camera_id: UUID4, redis: Redis) -> None:
    """Reset circuit state on a successful cross-worker call."""
    with contextlib.suppress(Exception):
        await redis.delete(_redis_key(camera_id))


async def record_failure(camera_id: UUID4, redis: Redis) -> None:
    """Record a failed cross-worker call; the circuit opens at the threshold."""
    key = _redis_key(camera_id)
    with contextlib.suppress(Exception):
        failures = int(await redis.incr(key))
        await redis.expire(key, int(COOL_DOWN_S))
        if failures == FAILURE_THRESHOLD:
            logger.warning(
                "Cross-worker relay circuit opened for camera %s after %d failures; "
                "fast-failing subsequent requests for %.0fs",
                camera_id,
                failures,
                COOL_DOWN_S,
            )
