"""Camera stream interaction routes."""

import logging
from typing import Annotated

from fastapi import Body, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from httpx import QueryParams
from pydantic import UUID4, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamMode, StreamView
from sqlmodel import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth_clients import google_youtube_oauth_client
from app.api.common.crud.utils import get_model_or_404
from app.api.common.exceptions import APIError
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.models import Product
from app.api.file_storage.schemas import VideoCreate, VideoRead
from app.api.file_storage.video_crud import create_video
from app.api.plugins.rpi_cam.exceptions import (
    GoogleOAuthAssociationRequiredError,
    InvalidCameraResponseError,
    NoActiveYouTubeRecordingError,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    build_camera_request,
    get_user_owned_camera,
    stream_from_camera_url,
)
from app.api.plugins.rpi_cam.services import (
    YouTubePrivacyStatus,
    YouTubeRecordingSession,
    YouTubeService,
    build_recording_text,
    clear_recording_session,
    load_recording_session,
    serialize_stream_metadata,
    store_recording_session,
)
from app.api.plugins.rpi_cam.youtube_schemas import YouTubeMonitorStreamResponse
from app.core.config import settings
from app.core.logging import sanitize_log_value
from app.core.redis import OptionalRedisDep, require_redis

# Initialize templates
templates = Jinja2Templates(directory=settings.templates_path)

# Initialize router
router = PublicAPIRouter()
logger = logging.getLogger(__name__)

### Constants ###
HLS_MANIFEST_FILENAME = "master.m3u8"
MAX_PREVIEW_STREAM_LENGTH_SECONDS = 7200  # 2 hours


### Common endpoints ###
@router.get("/{camera_id}/stream/status")
async def get_camera_stream_status(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> StreamView:
    """Get current stream status."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)
    response = await camera_request(
        endpoint="/stream/status",
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        return StreamView(**response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


@router.delete("/{camera_id}/stream/stop", status_code=204, summary="Stop the active stream")
async def stop_all_streams(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> None:
    """Stop the active stream (either youtube recording or preview stream)."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)
    await camera_request(
        endpoint="/stream/stop",
        method=HttpMethod.DELETE,
        error_msg="Failed to stop the active streams",
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
    product_id: Annotated[PositiveInt, Body(description="ID of product to associate the video with")],
    title: Annotated[str | None, Body(description="Custom video title")] = None,
    description: Annotated[str | None, Body(description="Custom description for the video")] = None,
    privacy_status: Annotated[
        YouTubePrivacyStatus, Body(description="Privacy status for the YouTube video")
    ] = YouTubePrivacyStatus.PRIVATE,
) -> StreamView:
    """Start recording to YouTube and cache the recording session in Redis."""
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
            OAuthAccount.user_id == current_user.db_id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
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
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)

    # Start Youtube stream
    response = await camera_request(
        endpoint="/stream/start",
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        query_params=QueryParams({"mode": StreamMode.YOUTUBE.value}),
        body=youtube_config.model_dump(exclude={"stream_id"}),
    )
    try:
        stream_info = StreamView(**response.json())
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
                broadcast_key=youtube_config.broadcast_key,
                video_metadata=serialize_stream_metadata(stream_info.metadata),
            ),
        )
    except HTTPException, APIError:
        try:
            await camera_request(
                endpoint="/stream/stop",
                method=HttpMethod.DELETE,
                error_msg="Failed to roll back stream after recording session storage failure",
                query_params=QueryParams({"mode": StreamMode.YOUTUBE.value}),
            )
        except HTTPException as cleanup_error:
            logger.warning(
                "Failed to roll back camera stream for camera %s: %s",
                sanitize_log_value(camera_id),
                sanitize_log_value(cleanup_error),
            )
        try:
            await youtube_service.end_livestream(youtube_config.broadcast_key)
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
    """Stop recording, end the livestream, and create the video record."""
    redis_client = require_redis(redis)
    recording_session = await load_recording_session(redis_client, camera_id)

    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)

    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.db_id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)
    camera_request = build_camera_request(camera, http_client)

    await camera_request(
        endpoint="/stream/stop",
        method=HttpMethod.DELETE,
        error_msg="Failed to stop stream",
        query_params=QueryParams({"mode": StreamMode.YOUTUBE.value}),
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
    current_user: CurrentActiveUserDep,
) -> YouTubeMonitorStreamResponse:
    """Get the YouTube monitor stream configuration for the active recording."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)

    stream_status_response = await camera_request(
        endpoint="/stream/status",
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        stream_info = StreamView(**stream_status_response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e

    if stream_info.youtube_config is None:
        raise NoActiveYouTubeRecordingError

    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.db_id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise GoogleOAuthAssociationRequiredError

    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client, session, http_client)
    return await youtube_service.get_broadcast_monitor_stream(stream_info.youtube_config.broadcast_key)


### Local stream preview ###
@router.post(
    "/{camera_id}/stream/preview/start", response_model=StreamView, status_code=201, summary="Start preview stream"
)
async def start_preview(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> StreamView:
    """Start local HLS preview stream. Stream will not be recorded."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)
    response = await camera_request(
        endpoint="/stream/start",
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        query_params=QueryParams({"mode": StreamMode.LOCAL.value}),
    )
    try:
        return StreamView(**response.json())
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


@router.delete("/{camera_id}/stream/preview/stop", status_code=204, summary="Stop preview stream")
async def stop_preview(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> None:
    """Stop recording and save video to database."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    camera_request = build_camera_request(camera, http_client)

    await camera_request(
        endpoint="/stream/stop",
        method=HttpMethod.DELETE,
        error_msg="Failed to stop stream",
        query_params=QueryParams({"mode": StreamMode.LOCAL.value}),
    )


@router.get(
    "/{camera_id}/stream/preview/hls/{file_path:path}",
    summary="Access HLS stream files from camera",
    description="Fetches and serves HLS stream files (.m3u8, .ts) from the camera",
)
async def hls_file_proxy(
    camera_id: UUID4,
    file_path: str,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> Response:
    """Proxy HLS files from camera to client."""
    camera = await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)
    response = await stream_from_camera_url(
        camera=camera,
        endpoint=f"/stream/hls/{file_path}",
        method=HttpMethod.GET,
        http_client=http_client,
        error_msg=f"Failed to get HLS file {file_path}",
    )

    response.headers.update(
        {
            "Cache-Control": "no-cache, no-store, must-revalidate"
            if file_path.endswith(".m3u8")  # Cache .ts segments but not playlists
            else f"max-age={MAX_PREVIEW_STREAM_LENGTH_SECONDS}",
        }
    )
    return response


@router.get(
    "/{camera_id}/stream/preview/watch",
    response_class=HTMLResponse,
    summary="Watch preview stream",
    description="Returns HTML viewer for remote HLS stream.",
)
async def watch_preview(
    request: Request,
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> HTMLResponse:
    """Serve HLS stream viewer from camera.

    Note: HTML viewer makes authenticated requests directly to camera's stream endpoint.
    """
    # Validate camera ownership
    await get_user_owned_camera(session, camera_id, current_user.db_id, http_client)

    return templates.TemplateResponse(
        "plugins/rpi_cam/remote_stream_viewer.html",
        {"request": request, "camera_id": camera_id, "hls_manifest_file": HLS_MANIFEST_FILENAME},
    )
