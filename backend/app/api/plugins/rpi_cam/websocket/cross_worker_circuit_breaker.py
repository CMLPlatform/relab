"""Circuit breaker for cross-worker WebSocket relay attempts."""

from __future__ import annotations

import contextlib
import logging
import time
from typing import TYPE_CHECKING

from pydantic import UUID4
from redis.exceptions import RedisError

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD = 3
COOL_DOWN_S = 30.0

_cross_worker_cb_state: dict[UUID4, tuple[int, float]] = {}


def _redis_key(camera_id: UUID4) -> str:
    return f"rpi_cam:cb:{camera_id}"


async def is_open(camera_id: UUID4, redis: Redis | None, *, now: float | None = None) -> bool:
    """Return True if the cross-worker circuit for ``camera_id`` is currently open."""
    entry = _cross_worker_cb_state.get(camera_id)
    if entry is not None:
        _failures, open_until = entry
        if (now if now is not None else time.monotonic()) < open_until:
            return True
    if redis is None:
        return False
    try:
        exists = await redis.exists(_redis_key(camera_id))
    except TimeoutError, RedisError, OSError, ConnectionError:
        return False
    return bool(exists)


async def record_success(camera_id: UUID4, redis: Redis | None) -> None:
    """Reset circuit state on a successful cross-worker call."""
    _cross_worker_cb_state.pop(camera_id, None)
    if redis is not None:
        with contextlib.suppress(Exception):
            await redis.delete(_redis_key(camera_id))


async def record_failure(camera_id: UUID4, redis: Redis | None) -> None:
    """Record a failed cross-worker call; open the circuit at the threshold."""
    failures, _ = _cross_worker_cb_state.get(camera_id, (0, 0.0))
    failures += 1
    open_until = time.monotonic() + COOL_DOWN_S if failures >= FAILURE_THRESHOLD else 0.0
    _cross_worker_cb_state[camera_id] = (failures, open_until)
    if open_until:
        logger.warning(
            "Cross-worker relay circuit opened for camera %s after %d failures; "
            "fast-failing subsequent requests for %.0fs",
            camera_id,
            failures,
            COOL_DOWN_S,
        )
        if redis is not None:
            with contextlib.suppress(Exception):
                await redis.set(_redis_key(camera_id), "1", ex=int(COOL_DOWN_S))


def reset_for_tests() -> None:
    """Test hook: clear all per-camera circuit breaker state."""
    _cross_worker_cb_state.clear()
