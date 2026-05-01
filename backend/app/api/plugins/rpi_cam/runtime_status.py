"""Runtime camera status and telemetry cache helpers."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import UUID4, ValidationError
from relab_rpi_cam_models.telemetry import TelemetrySnapshot

from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraStatus
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

TELEMETRY_CACHE_PREFIX = "rpi_cam:telemetry"
TELEMETRY_CACHE_TTL_SECONDS = 120


def get_camera_online_cache_key(camera_id: UUID4) -> str:
    """Get the Redis key for tracking camera online status."""
    return f"rpi_cam:online:{camera_id}"


def get_camera_last_seen_cache_key(camera_id: UUID4) -> str:
    """Get the Redis key for tracking when the camera was last seen."""
    return f"rpi_cam:last_seen:{camera_id}"


async def mark_camera_online(redis_client: Redis, camera_id: UUID4, ttl: int = 30) -> None:
    """Mark a camera as online in Redis, updating its last seen timestamp."""
    now = serialize_datetime_with_z(datetime.now(UTC))
    await set_redis_value(redis_client, get_camera_online_cache_key(camera_id), "1", ex=ttl)
    await set_redis_value(redis_client, get_camera_last_seen_cache_key(camera_id), now)


async def mark_camera_offline(redis_client: Redis, camera_id: UUID4) -> None:
    """Remove a camera's online status in Redis."""
    await delete_redis_key(redis_client, get_camera_online_cache_key(camera_id))


async def get_camera_status(redis_client: Redis | None, camera_id: UUID4) -> CameraStatus:
    """Fetch connection status globally from Redis cache."""
    if not redis_client:
        return CameraStatus(connection=CameraConnectionStatus.OFFLINE)

    pipeline = redis_client.pipeline()
    pipeline.get(get_camera_online_cache_key(camera_id))
    pipeline.get(get_camera_last_seen_cache_key(camera_id))
    online, last_seen_str = await pipeline.execute()

    conn = CameraConnectionStatus.ONLINE if online else CameraConnectionStatus.OFFLINE
    last_seen = datetime.fromisoformat(last_seen_str) if last_seen_str else None
    return CameraStatus(connection=conn, last_seen_at=last_seen)


def get_telemetry_cache_key(camera_id: UUID4) -> str:
    """Build the Redis key holding a camera's last-known telemetry snapshot."""
    return f"{TELEMETRY_CACHE_PREFIX}:{camera_id}"


async def store_telemetry(
    redis_client: Redis,
    camera_id: UUID4,
    snapshot: TelemetrySnapshot,
) -> None:
    """Cache a telemetry snapshot fetched from the Pi."""
    await set_redis_value(
        redis_client,
        get_telemetry_cache_key(camera_id),
        snapshot.model_dump_json(),
        ex=TELEMETRY_CACHE_TTL_SECONDS,
    )


async def get_cached_telemetry(
    redis_client: Redis | None,
    camera_id: UUID4,
) -> TelemetrySnapshot | None:
    """Return the most recent cached telemetry snapshot, or ``None`` on miss."""
    if not redis_client:
        return None
    payload = await get_redis_value(redis_client, get_telemetry_cache_key(camera_id))
    if payload is None:
        return None
    try:
        return TelemetrySnapshot.model_validate_json(payload)
    except ValidationError:
        logger.warning("Discarding malformed cached telemetry for camera %s", sanitize_log_value(camera_id))
        return None
