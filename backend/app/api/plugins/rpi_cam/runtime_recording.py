"""Runtime YouTube recording-session helpers."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

from pydantic import UUID4, BaseModel, HttpUrl, PositiveInt, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.schemas.base import serialize_datetime_with_z
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

    product_id: PositiveInt
    title: str
    description: str
    stream_url: HttpUrl
    broadcast_key: str
    video_metadata: dict[str, Any] | None = None


def get_recording_session_cache_key(camera_id: UUID4) -> str:
    """Build the Redis key for a camera's active YouTube recording."""
    return f"{YOUTUBE_RECORDING_SESSION_CACHE_PREFIX}:{camera_id}"


def build_recording_text(
    *,
    product_id: PositiveInt,
    title: str | None,
    description: str | None,
) -> tuple[str, str]:
    """Build the final title and description for a YouTube recording."""
    now_str = serialize_datetime_with_z(datetime.now(UTC))
    resolved_title = title or f"Product {product_id} recording at {now_str}"
    resolved_description = description or f"Recording of product {product_id} at {now_str}"
    return resolved_title, resolved_description


def serialize_stream_metadata(metadata: object | None) -> dict[str, Any] | None:
    """Convert camera stream metadata into JSON-compatible data."""
    if metadata is None:
        return None
    if isinstance(metadata, BaseModel):
        return metadata.model_dump(mode="json")
    if isinstance(metadata, dict):
        return cast("dict[str, Any]", metadata)
    msg = "Unsupported stream metadata type."
    raise TypeError(msg)


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
            product_id=int(session.product_id),
            title=session.title,
            description=session.description,
            stream_url=str(session.stream_url),
            broadcast_key=session.broadcast_key,
            video_metadata=session.video_metadata,
        )
        db_session.add(row)
    else:
        row.product_id = int(session.product_id)
        row.title = session.title
        row.description = session.description
        row.stream_url = str(session.stream_url)
        row.broadcast_key = session.broadcast_key
        row.video_metadata = session.video_metadata
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


def _recording_session_from_row(row: RecordingSession) -> YouTubeRecordingSession:
    """Convert the durable DB row into the service model."""
    return YouTubeRecordingSession.model_validate(
        {
            "product_id": row.product_id,
            "title": row.title,
            "description": row.description,
            "stream_url": row.stream_url,
            "broadcast_key": row.broadcast_key,
            "video_metadata": row.video_metadata,
        }
    )


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

    session = _recording_session_from_row(row)
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
