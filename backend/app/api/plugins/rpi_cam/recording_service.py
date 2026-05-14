"""YouTube recording orchestration for Raspberry Pi camera streams."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

from fastapi import HTTPException
from pydantic import UUID4, BaseModel, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamMode, StreamView
from sqlalchemy import select

from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth_clients import google_youtube_oauth_client
from app.api.common.crud.query import require_model
from app.api.common.exceptions import APIError
from app.api.common.ownership import get_user_owned_object
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.video import create_video, delete_video
from app.api.file_storage.models import Video
from app.api.file_storage.schemas import VideoCreate, VideoRead
from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT, HttpMethod
from app.api.plugins.rpi_cam.exceptions import (
    GoogleOAuthAssociationRequiredError,
    InvalidCameraResponseError,
    NoActiveYouTubeRecordingError,
    RecordingSessionNotFoundError,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.runtime_recording import (
    YouTubeRecordingSession,
    clear_recording_session,
    load_recording_session,
    store_recording_session,
)
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.youtube import YouTubePrivacyStatus, YouTubeService
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.common.schemas.custom_fields import HttpUrlToDB
    from app.api.plugins.rpi_cam.relay_response import RelayResponse

logger = logging.getLogger(__name__)


async def start_youtube_recording(
    *,
    camera_id: UUID4,
    session: AsyncSession,
    http_client: AsyncClient,
    redis: Redis,
    current_user: User,
    product_id: PositiveInt,
    title: str | None,
    description: str | None,
    privacy_status: YouTubePrivacyStatus,
) -> StreamView:
    """Start a YouTube recording stream, create its video row, and cache the session."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)

    existing_stream = await _resolve_existing_recording(redis, session, camera_id, camera_request)
    if existing_stream is not None:
        return existing_stream

    await get_user_owned_object(session, Product, product_id, camera.owner_id)

    resolved_title, resolved_description = _build_recording_text(
        product_id=product_id,
        title=title,
        description=description,
    )
    youtube_service = await _build_youtube_service(session, http_client, current_user)

    youtube_config = await youtube_service.setup_livestream(
        resolved_title,
        privacy_status=privacy_status,
        description=resolved_description,
    )
    created_video_id: int | None = None

    try:
        response = await camera_request(
            endpoint=PLUGIN_STREAM_ENDPOINT,
            method=HttpMethod.POST,
            error_msg="Failed to start stream",
            body={
                "stream_key": youtube_config.stream_key.get_secret_value(),
                "broadcast_key": youtube_config.broadcast_key.get_secret_value(),
            },
        )
        stream_info = _validate_stream_view(response.json())
        await youtube_service.validate_stream_status(youtube_config.stream_id)
        created_video = await create_video(
            session,
            VideoCreate(
                url=cast("HttpUrlToDB", stream_info.url),
                title=resolved_title,
                description=resolved_description,
                product_id=product_id,
                video_metadata=_serialize_stream_metadata(stream_info.metadata),
            ),
        )
        created_video_id = created_video.id
        await store_recording_session(
            redis,
            session,
            camera_id,
            YouTubeRecordingSession(
                video_id=created_video.id,
                broadcast_key=youtube_config.broadcast_key.get_secret_value(),
            ),
        )
    except HTTPException, APIError:
        await _roll_back_started_recording(
            session=session,
            camera_id=camera_id,
            camera_request=camera_request,
            youtube_service=youtube_service,
            broadcast_key=youtube_config.broadcast_key.get_secret_value(),
            video_id=created_video_id,
        )
        raise

    return stream_info


async def stop_youtube_recording(
    *,
    camera_id: UUID4,
    session: AsyncSession,
    http_client: AsyncClient,
    redis: Redis,
    current_user: User,
) -> VideoRead:
    """Stop an active YouTube recording and return the video created for it."""
    recording_session = await load_recording_session(redis, session, camera_id)
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    youtube_service = await _build_youtube_service(session, http_client, current_user)
    camera_request = build_camera_request(camera, redis)

    await youtube_service.end_livestream(recording_session.broadcast_key)

    try:
        await camera_request(
            endpoint=PLUGIN_STREAM_ENDPOINT,
            method=HttpMethod.DELETE,
            error_msg="Failed to stop stream",
        )
    except (HTTPException, APIError) as camera_cleanup_error:
        logger.warning(
            "YouTube broadcast ended but Pi stream cleanup failed for camera %s: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(camera_cleanup_error),
        )

    video = await require_model(session, Video, recording_session.video_id)
    await clear_recording_session(redis, session, camera_id)
    return VideoRead.model_validate(video)


async def get_youtube_recording_monitor_stream(
    *,
    camera_id: UUID4,
    session: AsyncSession,
    http_client: AsyncClient,
    redis: Redis,
    current_user: User,
) -> YouTubeMonitorStreamResponse:
    """Return the YouTube monitor stream for the active backend-owned recording session."""
    recording_session = await load_recording_session(redis, session, camera_id)
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)

    stream_status_response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    stream_info = _validate_stream_view(stream_status_response.json())
    if stream_info.mode != StreamMode.YOUTUBE:
        raise NoActiveYouTubeRecordingError

    youtube_service = await _build_youtube_service(session, http_client, current_user)
    return await youtube_service.get_broadcast_monitor_stream(recording_session.broadcast_key)


async def _build_youtube_service(session: AsyncSession, http_client: AsyncClient, current_user: User) -> YouTubeService:
    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id,
            OAuthAccount.oauth_name == google_youtube_oauth_client.name,
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError
    return YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)


def _build_recording_text(
    *,
    product_id: PositiveInt,
    title: str | None,
    description: str | None,
) -> tuple[str, str]:
    now_str = serialize_datetime_with_z(datetime.now(UTC))
    return title or f"Product {product_id} recording at {now_str}", description or (
        f"Recording of product {product_id} at {now_str}"
    )


def _serialize_stream_metadata(metadata: object | None) -> dict[str, Any] | None:
    if metadata is None:
        return None
    if isinstance(metadata, BaseModel):
        return metadata.model_dump(mode="json")
    if isinstance(metadata, dict):
        return cast("dict[str, Any]", metadata)
    msg = "Unsupported stream metadata type."
    raise TypeError(msg)


def _validate_stream_view(payload: object) -> StreamView:
    try:
        return StreamView.model_validate(payload)
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


async def _resolve_existing_recording(
    redis_client: Redis,
    session: AsyncSession,
    camera_id: UUID4,
    camera_request: Callable[..., Awaitable[RelayResponse]],
) -> StreamView | None:
    """Return the live stream when a cached recording session is still active."""
    try:
        await load_recording_session(redis_client, session, camera_id)
    except RecordingSessionNotFoundError:
        return None

    try:
        response = await camera_request(
            endpoint=PLUGIN_STREAM_ENDPOINT,
            method=HttpMethod.GET,
            error_msg="Failed to verify existing recording stream",
        )
        stream_view = _validate_stream_view(response.json())
    except APIError as exc:
        logger.warning(
            "Cached recording session for camera %s could not be verified (%s); clearing",
            sanitize_log_value(camera_id),
            sanitize_log_value(exc),
        )
        await clear_recording_session(redis_client, session, camera_id)
        return None

    if stream_view.mode != StreamMode.YOUTUBE:
        logger.warning(
            "Cached recording session for camera %s is stale (mode=%s); clearing",
            sanitize_log_value(camera_id),
            sanitize_log_value(stream_view.mode),
        )
        await clear_recording_session(redis_client, session, camera_id)
        return None

    return stream_view


async def _roll_back_started_recording(
    *,
    session: AsyncSession,
    camera_id: UUID4,
    camera_request: Callable[..., Awaitable[RelayResponse]],
    youtube_service: YouTubeService,
    broadcast_key: str,
    video_id: int | None,
) -> None:
    try:
        await camera_request(
            endpoint=PLUGIN_STREAM_ENDPOINT,
            method=HttpMethod.DELETE,
            error_msg="Failed to roll back stream after recording start failure",
        )
    except (HTTPException, APIError) as cleanup_error:
        logger.warning(
            "Failed to roll back camera stream for camera %s: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(cleanup_error),
        )

    try:
        await youtube_service.end_livestream(broadcast_key)
    except APIError as cleanup_error:
        logger.warning(
            "Failed to roll back YouTube livestream for camera %s: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(cleanup_error),
        )

    if video_id is not None:
        try:
            await delete_video(session, video_id)
        except APIError as cleanup_error:
            logger.warning(
                "Failed to delete rolled-back video %s for camera %s: %s",
                sanitize_log_value(video_id),
                sanitize_log_value(camera_id),
                sanitize_log_value(cleanup_error),
            )
