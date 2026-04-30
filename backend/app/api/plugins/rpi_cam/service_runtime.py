"""Runtime-facing camera helpers for cache, recording sessions, and image capture."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from pydantic import UUID4, AnyUrl, BaseModel, PositiveInt, ValidationError
from relab_rpi_cam_models.images import ImageCaptureStatus
from relab_rpi_cam_models.telemetry import TelemetrySnapshot
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.ownership import get_user_owned_object
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.exceptions import (
    InvalidCameraResponseError,
    RecordingSessionNotFoundError,
    RecordingSessionStoreError,
)
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraStatus, RecordingSession
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from app.core.config import settings
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from pathlib import Path

    from httpx import Response
    from redis.asyncio import Redis


logger = logging.getLogger(__name__)

TELEMETRY_CACHE_PREFIX = "rpi_cam:telemetry"
TELEMETRY_CACHE_TTL_SECONDS = 120
PREVIEW_THUMBNAIL_SUBDIR = "rpi-cam-preview"
YOUTUBE_RECORDING_SESSION_CACHE_PREFIX = "rpi_cam:youtube_recording"
YOUTUBE_RECORDING_SESSION_TTL_SECONDS = 60 * 60 * 48


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


def get_preview_thumbnail_path(camera_id: UUID4) -> Path:
    """Return the deterministic backend storage path for one camera's preview thumbnail."""
    return settings.image_storage_path / PREVIEW_THUMBNAIL_SUBDIR / f"{camera_id}.jpg"


def get_preview_thumbnail_url(camera_id: UUID4) -> str | None:
    """Return the public URL for one camera's cached preview thumbnail when present."""
    path = get_preview_thumbnail_path(camera_id)
    try:
        mtime = int(path.stat().st_mtime)
    except FileNotFoundError:
        return None
    relative_path = path.relative_to(settings.image_storage_path)
    return f"/uploads/images/{relative_path.as_posix()}?v={mtime}"


def get_preview_thumbnail_urls_per_camera(camera_ids: list[UUID4]) -> dict[UUID, str | None]:
    """Return deterministic preview-thumbnail URLs for the given cameras."""
    return {UUID(str(camera_id)): get_preview_thumbnail_url(camera_id) for camera_id in camera_ids}


class YouTubeRecordingSession(BaseModel):
    """Cached state for an in-progress YouTube recording."""

    product_id: PositiveInt
    title: str
    description: str
    stream_url: AnyUrl
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
        # ty narrows isinstance(metadata, dict) to dict[Unknown, Unknown]; dict is invariant
        # so a plain annotation can't widen it. Cast stays.
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


async def capture_and_store_image(
    session: AsyncSession,
    *,
    camera_request: Callable[..., Awaitable[Response | RelayResponse]],
    product_id: PositiveInt,
    owner_id: UUID4,
    filename: str | None = None,
    description: str | None = None,
) -> Image:
    """Trigger a capture on the Pi and return the resulting stored ``Image``."""
    await get_user_owned_object(session, Product, product_id, owner_id)

    upload_metadata: dict[str, Any] = {"product_id": int(product_id)}
    if description is not None:
        upload_metadata["description"] = description
    if filename is not None:
        upload_metadata["filename"] = filename

    capture_response = await camera_request(
        endpoint="/captures",
        method=HttpMethod.POST,
        body=upload_metadata,
        error_msg="Failed to capture image",
    )
    try:
        capture_data = cast("dict[str, Any]", capture_response.json())
    except json.JSONDecodeError as e:
        body_preview = getattr(capture_response, "content", b"")[:200]
        logger.exception(
            "Camera returned non-JSON response for POST /captures (%d bytes): %r",
            len(getattr(capture_response, "content", b"")),
            body_preview,
        )
        raise InvalidCameraResponseError(
            details=f"Expected JSON, got {len(body_preview)} bytes: {body_preview!r}",
        ) from e

    status_value = str(capture_data.get("status") or ImageCaptureStatus.UPLOADED)
    if status_value == ImageCaptureStatus.QUEUED:
        raise InvalidCameraResponseError(
            details=(
                "Camera captured the image but the synchronous push to the backend failed; "
                "it was queued on the device for retry. Please try again."
            ),
        )
    if status_value != ImageCaptureStatus.UPLOADED:
        raise InvalidCameraResponseError(
            details=f"Camera returned an unknown capture status: {status_value!r}",
        )

    image_id_hex = capture_data.get("image_id")
    if not isinstance(image_id_hex, str):
        raise InvalidCameraResponseError(
            details=f"Camera response missing image_id: {capture_data!r}",
        )
    try:
        image_uuid = UUID(hex=image_id_hex)
    except ValueError as exc:
        raise InvalidCameraResponseError(
            details=f"Camera returned malformed image_id: {image_id_hex!r}",
        ) from exc

    image = await session.get(Image, image_uuid)
    if image is None:
        raise InvalidCameraResponseError(
            details=(
                f"Camera reported a successful upload but image {image_id_hex} was not found "
                "in the backend database — upload may have been written to a different session."
            ),
        )
    return image
