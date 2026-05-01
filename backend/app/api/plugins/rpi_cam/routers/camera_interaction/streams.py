"""Camera stream interaction routes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Annotated

from fastapi import Body, HTTPException
from pydantic import UUID4, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamMode, StreamView
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth_clients import google_youtube_oauth_client
from app.api.common.exceptions import APIError
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.video import create_video
from app.api.file_storage.schemas import VideoCreate, VideoRead
from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT, HttpMethod
from app.api.plugins.rpi_cam.examples import (
    CAMERA_START_RECORDING_DESCRIPTION_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_PRIVACY_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_PRODUCT_ID_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_TITLE_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.exceptions import (
    GoogleOAuthAssociationRequiredError,
    InvalidCameraResponseError,
    InvalidRecordingSessionDataError,
    NoActiveYouTubeRecordingError,
    RecordingSessionNotFoundError,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.runtime_recording import (
    YouTubeRecordingSession,
    build_recording_text,
    clear_recording_session,
    get_recording_session_cache_key,
    load_recording_session,
    serialize_stream_metadata,
    store_recording_session,
)
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services import (
    YouTubePrivacyStatus,
    YouTubeService,
)
from app.core.logging import sanitize_log_value
from app.core.redis import OptionalRedisDep, require_redis

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from redis.asyncio import Redis

    from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse

# Initialize router
router = PublicAPIRouter()
logger = logging.getLogger(__name__)


### Common endpoints ###
@router.get(
    "/{camera_id}/recording-stream",
    summary="Get the active YouTube recording stream status",
    description="Fetch the current remote camera stream status from the Raspberry Pi camera plugin.",
)
async def get_camera_stream_status(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: OptionalRedisDep,
) -> StreamView:
    """Fetch the current remote camera stream status from the device plugin."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)
    response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        return StreamView.model_validate(response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


### Recording to Youtube ###
# We cache the recording session in Redis on start and finalize the Video row on stop.


@router.post(
    "/{camera_id}/recording-stream", response_model=StreamView, status_code=201, summary="Start recording to YouTube"
)
async def start_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: OptionalRedisDep,
    current_user: CurrentActiveUserDep,
    product_id: Annotated[
        PositiveInt,
        Body(
            description="ID of product to associate the video with",
            openapi_examples=CAMERA_START_RECORDING_PRODUCT_ID_OPENAPI_EXAMPLES,
        ),
    ],
    title: Annotated[
        SingleLineUserText | None,
        Body(
            description="Custom video title",
            max_length=100,
            openapi_examples=CAMERA_START_RECORDING_TITLE_OPENAPI_EXAMPLES,
        ),
    ] = None,
    description: Annotated[
        MultilineUserText | None,
        Body(
            description="Custom description for the video",
            max_length=500,
            openapi_examples=CAMERA_START_RECORDING_DESCRIPTION_OPENAPI_EXAMPLES,
        ),
    ] = None,
    privacy_status: Annotated[
        YouTubePrivacyStatus,
        Body(
            description="Privacy status for the YouTube video",
            openapi_examples=CAMERA_START_RECORDING_PRIVACY_OPENAPI_EXAMPLES,
        ),
    ] = YouTubePrivacyStatus.PRIVATE,
) -> StreamView:
    """Start a YouTube recording stream and cache the backend-owned session in Redis."""
    redis_client = require_redis(redis)

    # Fetch user camera up-front so product ownership is checked against the
    # same owner that controls the camera.
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    await get_user_owned_object(session, Product, product_id, camera.owner_id)

    resolved_title, resolved_description = build_recording_text(
        product_id=product_id,
        title=title,
        description=description,
    )

    # Get Google OAuth account
    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    # Initialize YouTube service
    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)

    camera_request = build_camera_request(camera, redis)

    # Idempotency guard: if a prior POST already started a recording but the response never reached
    # the client (network retry), return the live StreamView instead of creating a second broadcast.
    existing_stream = await _resolve_existing_recording(redis_client, session, camera_id, camera_request)
    if existing_stream is not None:
        return existing_stream

    # Create livestream
    youtube_config = await youtube_service.setup_livestream(
        resolved_title,
        privacy_status=privacy_status,
        description=resolved_description,
    )

    # Start Youtube stream
    response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        body={
            "stream_key": youtube_config.stream_key.get_secret_value(),
            "broadcast_key": youtube_config.broadcast_key.get_secret_value(),
        },
    )
    try:
        stream_info = StreamView.model_validate(response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e

    # Validate stream is active
    await youtube_service.validate_stream_status(youtube_config.stream_id)

    try:
        await store_recording_session(
            redis_client,
            session,
            camera_id,
            YouTubeRecordingSession.model_validate(
                {
                    "product_id": product_id,
                    "title": resolved_title,
                    "description": resolved_description,
                    "stream_url": str(stream_info.url),
                    "broadcast_key": youtube_config.broadcast_key.get_secret_value(),
                    "video_metadata": serialize_stream_metadata(stream_info.metadata),
                }
            ),
        )
    except HTTPException, APIError:
        try:
            await camera_request(
                endpoint=PLUGIN_STREAM_ENDPOINT,
                method=HttpMethod.DELETE,
                error_msg="Failed to roll back stream after recording session storage failure",
            )
        except (HTTPException, APIError) as cleanup_error:
            logger.warning(
                "Failed to roll back camera stream for camera %s: %s",
                sanitize_log_value(camera_id),
                sanitize_log_value(cleanup_error),
            )
        try:
            await youtube_service.end_livestream(youtube_config.broadcast_key.get_secret_value())
        except APIError as cleanup_error:
            logger.warning(
                "Failed to roll back YouTube livestream for camera %s: %s",
                sanitize_log_value(camera_id),
                sanitize_log_value(cleanup_error),
            )
        raise

    return stream_info


async def _resolve_existing_recording(
    redis_client: Redis,
    session: AsyncSessionDep,
    camera_id: UUID4,
    camera_request: Callable[..., Awaitable[RelayResponse]],
) -> StreamView | None:
    """Return the live StreamView if a recording session already exists and is still active.

    If the cached session is stale (Pi lost the stream, or mode is not YouTube), the session is
    cleared and ``None`` is returned so the caller can proceed with a fresh recording.
    """
    try:
        await load_recording_session(redis_client, session, camera_id)
    except RecordingSessionNotFoundError:
        return None
    except InvalidRecordingSessionDataError as exc:
        logger.warning(
            "Cached recording session for camera %s is corrupt (%s); clearing",
            sanitize_log_value(camera_id),
            sanitize_log_value(exc),
        )
        await clear_recording_session(redis_client, session, camera_id)
        return None

    try:
        response = await camera_request(
            endpoint=PLUGIN_STREAM_ENDPOINT,
            method=HttpMethod.GET,
            error_msg="Failed to verify existing recording stream",
        )
        stream_view = StreamView.model_validate(response.json())
    except (APIError, ValidationError) as exc:
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


@router.delete(
    "/{camera_id}/recording-stream",
    response_model=VideoRead,
    summary="Stop recording to YouTube",
)
async def stop_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: OptionalRedisDep,
    current_user: CurrentActiveUserDep,
) -> VideoRead:
    """Stop the active YouTube recording, end the livestream, and create the video record.

    Cleanup order is: YouTube first, then the Pi. If the Pi is offline the YouTube broadcast
    must still be torn down to avoid leaving orphan broadcasts on the user's channel. A Pi
    cleanup failure degrades to a warning — the recording state on YouTube is what the user
    cares about, and a running MediaMTX stream will eventually be noticed and stopped anyway.
    """
    redis_client = require_redis(redis)
    recording_session = await load_recording_session(redis_client, session, camera_id)

    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)

    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)
    camera_request = build_camera_request(camera, redis)

    # End the YouTube broadcast first so a Pi outage cannot strand an orphan live broadcast.
    # If this fails we leave the recording session in Redis so the caller can retry.
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

    video = VideoCreate.model_validate(
        {
            "url": str(recording_session.stream_url),
            "title": recording_session.title,
            "description": recording_session.description,
            "product_id": recording_session.product_id,
            "video_metadata": recording_session.video_metadata,
        }
    )
    created_video = await create_video(session, video)
    await clear_recording_session(redis_client, session, camera_id)

    return VideoRead.model_validate(created_video)


@router.get(
    "/{camera_id}/recording-stream/monitor",
    response_model=YouTubeMonitorStreamResponse,
    summary="Get YouTube livestream monitor stream",
)
async def get_recording_monitor_stream(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: OptionalRedisDep,
    current_user: CurrentActiveUserDep,
) -> YouTubeMonitorStreamResponse:
    """Get the YouTube monitor stream for the active backend-owned recording session."""
    redis_client = require_redis(redis)
    recording_session = await load_recording_session(redis_client, session, camera_id)
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)

    stream_status_response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        stream_info = StreamView.model_validate(stream_status_response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e

    if stream_info.mode != StreamMode.YOUTUBE:
        raise NoActiveYouTubeRecordingError

    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)
    logger.debug(
        "Using cached recording session for monitor stream lookup: %s",
        sanitize_log_value(get_recording_session_cache_key(camera_id)),
    )
    return await youtube_service.get_broadcast_monitor_stream(recording_session.broadcast_key)
