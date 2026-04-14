"""Camera stream interaction routes."""

import logging
from typing import Annotated

from fastapi import Body, HTTPException
from pydantic import UUID4, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamMode, StreamView
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth_clients import google_youtube_oauth_client
from app.api.common.crud.utils import get_model_or_404
from app.api.common.exceptions import APIError
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
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
    NoActiveYouTubeRecordingError,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services import (
    YouTubePrivacyStatus,
    YouTubeRecordingSession,
    YouTubeService,
    build_recording_text,
    clear_recording_session,
    get_recording_session_cache_key,
    load_recording_session,
    serialize_stream_metadata,
    store_recording_session,
)
from app.core.logging import sanitize_log_value
from app.core.redis import OptionalRedisDep, require_redis

# Initialize router
router = PublicAPIRouter()
logger = logging.getLogger(__name__)


### Common endpoints ###
@router.get(
    "/{camera_id}/stream/status",
    summary="Get the active YouTube recording stream status",
    description="Fetch the current remote camera stream status from the Raspberry Pi camera plugin.",
)
async def get_camera_stream_status(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> StreamView:
    """Fetch the current remote camera stream status from the device plugin."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    camera_request = build_camera_request(camera)
    response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        return StreamView.model_validate(response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


@router.delete(
    "/{camera_id}/stream/stop",
    status_code=204,
    summary="Stop the active YouTube recording stream",
    description="Stop the currently active remote camera stream.",
)
async def stop_all_streams(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> None:
    """Stop the currently active remote camera stream."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    camera_request = build_camera_request(camera)
    await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.DELETE,
        error_msg="Failed to stop the active stream",
    )


### Recording to Youtube ###
# We cache the recording session in Redis on start and finalize the Video row on stop.


@router.post(
    "/{camera_id}/stream/record/start", response_model=StreamView, status_code=201, summary="Start recording to YouTube"
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
        str | None,
        Body(
            description="Custom video title",
            openapi_examples=CAMERA_START_RECORDING_TITLE_OPENAPI_EXAMPLES,
        ),
    ] = None,
    description: Annotated[
        str | None,
        Body(
            description="Custom description for the video",
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
    # Validate video data before starting stream
    await get_model_or_404(session, Product, product_id)
    redis_client = require_redis(redis)
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

    # Create livestream
    youtube_config = await youtube_service.setup_livestream(
        resolved_title,
        privacy_status=privacy_status,
        description=resolved_description,
    )

    # Fetch user camera
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    camera_request = build_camera_request(camera)

    # Start Youtube stream
    response = await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        body=youtube_config.model_dump(exclude={"stream_id"}),
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
            camera_id,
            YouTubeRecordingSession(
                product_id=product_id,
                title=resolved_title,
                description=resolved_description,
                stream_url=stream_info.url,
                broadcast_key=youtube_config.broadcast_key.get_secret_value(),
                video_metadata=serialize_stream_metadata(stream_info.metadata),
            ),
        )
    except HTTPException, APIError:
        try:
            await camera_request(
                endpoint=PLUGIN_STREAM_ENDPOINT,
                method=HttpMethod.DELETE,
                error_msg="Failed to roll back stream after recording session storage failure",
            )
        except HTTPException as cleanup_error:
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


@router.delete(
    "/{camera_id}/stream/record/stop",
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
    """Stop the active YouTube recording, end the livestream, and create the video record."""
    redis_client = require_redis(redis)
    recording_session = await load_recording_session(redis_client, camera_id)

    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)
    camera_request = build_camera_request(camera)

    await camera_request(
        endpoint=PLUGIN_STREAM_ENDPOINT,
        method=HttpMethod.DELETE,
        error_msg="Failed to stop stream",
    )

    await youtube_service.end_livestream(recording_session.broadcast_key)

    video = VideoCreate(
        url=recording_session.stream_url,
        title=recording_session.title,
        description=recording_session.description,
        product_id=recording_session.product_id,
        video_metadata=recording_session.video_metadata,
    )
    created_video = await create_video(session, video)
    await clear_recording_session(redis_client, camera_id)

    return VideoRead.model_validate(created_video)


@router.get(
    "/{camera_id}/stream/record/monitor",
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
    recording_session = await load_recording_session(redis_client, camera_id)
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    camera_request = build_camera_request(camera)

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
