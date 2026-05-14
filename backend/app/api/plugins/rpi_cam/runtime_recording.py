"""Runtime YouTube recording-session helpers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import UUID4, BaseModel, PositiveInt, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.plugins.rpi_cam.exceptions import RecordingSessionNotFoundError, RecordingSessionStoreError
from app.api.plugins.rpi_cam.models import RecordingSession
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

YOUTUBE_RECORDING_SESSION_CACHE_PREFIX = "rpi_cam:youtube_recording"
YOUTUBE_RECORDING_SESSION_TTL_SECONDS = 60 * 60 * 48


class YouTubeRecordingSession(BaseModel):
    """Cached state for an in-progress YouTube recording."""

    video_id: PositiveInt
    broadcast_key: str


def get_recording_session_cache_key(camera_id: UUID4) -> str:
    """Build the Redis key for a camera's active YouTube recording."""
    return f"{YOUTUBE_RECORDING_SESSION_CACHE_PREFIX}:{camera_id}"


async def store_recording_session(
    redis_client: Redis,
    db_session: AsyncSession,
    camera_id: UUID4,
    session: YouTubeRecordingSession,
) -> None:
    """Persist in-progress recording state in Redis plus the DB backstop."""
    row = await db_session.get(RecordingSession, camera_id)
    if row is None:
        row = RecordingSession(
            camera_id=camera_id,
            video_id=session.video_id,
            broadcast_key=session.broadcast_key,
        )
        db_session.add(row)
    else:
        row.video_id = session.video_id
        row.broadcast_key = session.broadcast_key
    await db_session.commit()

    stored = await set_redis_value(
        redis_client,
        get_recording_session_cache_key(camera_id),
        session.model_dump_json(),
        ex=YOUTUBE_RECORDING_SESSION_TTL_SECONDS,
    )
    if not stored:
        persisted_row = await db_session.get(RecordingSession, camera_id)
        if persisted_row is not None:
            await db_session.delete(persisted_row)
            await db_session.commit()
        raise RecordingSessionStoreError


async def load_recording_session(
    redis_client: Redis,
    db_session: AsyncSession,
    camera_id: UUID4,
) -> YouTubeRecordingSession:
    """Load recording state from Redis, falling back to the DB backstop."""
    payload = await get_redis_value(redis_client, get_recording_session_cache_key(camera_id))
    if payload is not None:
        try:
            return YouTubeRecordingSession.model_validate_json(payload)
        except ValidationError:
            logger.warning(
                "Discarding malformed cached recording session for camera %s; falling back to DB",
                sanitize_log_value(camera_id),
            )

    row = await db_session.get(RecordingSession, camera_id)
    if row is None:
        raise RecordingSessionNotFoundError

    session = YouTubeRecordingSession(video_id=row.video_id, broadcast_key=row.broadcast_key)
    stored = await set_redis_value(
        redis_client,
        get_recording_session_cache_key(camera_id),
        session.model_dump_json(),
        ex=YOUTUBE_RECORDING_SESSION_TTL_SECONDS,
    )
    if not stored:
        logger.warning("Failed to repopulate Redis recording session for camera %s", sanitize_log_value(camera_id))
    return session


async def clear_recording_session(redis_client: Redis, db_session: AsyncSession, camera_id: UUID4) -> None:
    """Remove recording state from Redis and the DB backstop."""
    row = await db_session.get(RecordingSession, camera_id)
    if row is not None:
        await db_session.delete(row)
        await db_session.commit()

    cleared = await delete_redis_key(redis_client, get_recording_session_cache_key(camera_id))
    if not cleared:
        logger.warning("Failed to clear YouTube recording session for camera %s", sanitize_log_value(camera_id))
