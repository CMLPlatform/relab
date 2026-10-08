"""Runtime camera status and telemetry cache helpers."""

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import UUID4, ValidationError
from redis.exceptions import RedisError
from relab_rpi_cam_models.telemetry import TelemetrySnapshot

from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraStatus
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

if TYPE_CHECKING:
    from collections.abc import Sequence

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


# At least 2x the 30s heartbeat (`_HEARTBEAT_INTERVAL` in websocket/router.py) plus
# slack, or a healthy camera reads OFFLINE between expiry and the next pong.
ONLINE_STATUS_TTL_SECONDS = 75
# Refreshed on every heartbeat, so it only lapses for a camera offline this long; that
# camera then reads "never seen". Bounds the key for a deleted camera, which a pong racing
# the delete could otherwise recreate after any explicit cleanup.
LAST_SEEN_TTL_SECONDS = 90 * 24 * 3600


async def mark_camera_online(redis_client: Redis, camera_id: UUID4, ttl: int = ONLINE_STATUS_TTL_SECONDS) -> None:
    """Mark a camera as online in Redis, updating its last seen timestamp."""
    now = serialize_datetime_with_z(datetime.now(UTC))
    await set_redis_value(redis_client, get_camera_online_cache_key(camera_id), "1", ex=ttl)
    await set_redis_value(redis_client, get_camera_last_seen_cache_key(camera_id), now, ex=LAST_SEEN_TTL_SECONDS)


async def mark_camera_offline(redis_client: Redis, camera_id: UUID4) -> None:
    """Remove a camera's online status in Redis."""
    await delete_redis_key(redis_client, get_camera_online_cache_key(camera_id))


async def get_camera_statuses(
    redis_client: Redis,
    camera_ids: Sequence[UUID4],
    *,
    include_telemetry: bool = False,
) -> dict[UUID4, tuple[CameraStatus, TelemetrySnapshot | None]]:
    """Fetch status, and optionally cached telemetry, for many cameras in one Redis round trip.

    Degrades to OFFLINE with no last-seen timestamp or telemetry on a Redis outage,
    rather than raising and turning every camera-status read into a 500.
    """
    keys_per_camera = 3 if include_telemetry else 2
    pipeline = redis_client.pipeline()
    for camera_id in camera_ids:
        pipeline.get(get_camera_online_cache_key(camera_id))
        pipeline.get(get_camera_last_seen_cache_key(camera_id))
        if include_telemetry:
            pipeline.get(get_telemetry_cache_key(camera_id))
    try:
        values = await pipeline.execute() if camera_ids else []
    except RedisError, OSError, TimeoutError:
        logger.warning("Redis unavailable fetching status for %d camera(s); reporting offline.", len(camera_ids))
        values = [None] * (keys_per_camera * len(camera_ids))

    result: dict[UUID4, tuple[CameraStatus, TelemetrySnapshot | None]] = {}
    for index, camera_id in enumerate(camera_ids):
        online, last_seen_str, *rest = values[index * keys_per_camera : (index + 1) * keys_per_camera]
        status = CameraStatus(
            connection=CameraConnectionStatus.ONLINE if online else CameraConnectionStatus.OFFLINE,
            last_seen_at=datetime.fromisoformat(last_seen_str) if last_seen_str else None,
        )
        telemetry = _parse_telemetry(rest[0], camera_id) if rest else None
        result[camera_id] = (status, telemetry)
    return result


async def get_camera_status(redis_client: Redis, camera_id: UUID4) -> CameraStatus:
    """Fetch one camera's connection status from the Redis cache; see ``get_camera_statuses``."""
    return (await get_camera_statuses(redis_client, [camera_id]))[camera_id][0]


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
    redis_client: Redis,
    camera_id: UUID4,
) -> TelemetrySnapshot | None:
    """Return the most recent cached telemetry snapshot, or ``None`` on miss."""
    return _parse_telemetry(await get_redis_value(redis_client, get_telemetry_cache_key(camera_id)), camera_id)


def _parse_telemetry(payload: str | bytes | None, camera_id: UUID4) -> TelemetrySnapshot | None:
    if payload is None:
        return None
    try:
        return TelemetrySnapshot.model_validate_json(payload)
    except ValidationError:
        logger.warning("Discarding malformed cached telemetry for camera %s", sanitize_log_value(camera_id))
        return None
