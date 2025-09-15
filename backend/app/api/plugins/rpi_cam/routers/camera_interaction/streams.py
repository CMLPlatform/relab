"""Camera stream interaction routes."""

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Body, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from httpx import QueryParams
from pydantic import UUID4, AnyUrl, HttpUrl, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamMode, StreamView
from sqlmodel import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth import google_youtube_oauth_client
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models import Product
from app.api.file_storage.crud import create_video
from app.api.file_storage.models.models import Video
from app.api.file_storage.schemas import VideoCreate, VideoRead
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    fetch_from_camera_url,
    get_user_owned_camera,
)
from app.api.plugins.rpi_cam.services import YouTubePrivacyStatus, YouTubeService
from app.core.config import settings

# Initialize templates
templates = Jinja2Templates(directory=settings.templates_path)

# Initialize router
router = PublicAPIRouter()

### Constants ###
# TODO: dynamically fetch the manifest file name from the camera
HLS_MANIFEST_FILENAME = "master.m3u8"
MAX_PREVIEW_STREAM_LENGTH_SECONDS = 7200  # 2 hours

### Common endpoints ###
# TODO: Move the CRUD like functionalities to services.py


@router.get("/{camera_id}/stream/status")
async def get_camera_stream_status(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> StreamView:
    """Get current stream status."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/status",
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )
    try:
        return StreamView(**response.json())
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e


@router.delete("/{camera_id}/stream/stop", status_code=204, summary="Stop the active stream")
async def stop_all_streams(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> None:
    """Stop the active stream (either youtube recording or preview stream)."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/stop",
        method=HttpMethod.DELETE,
        error_msg="Failed to stop the active streams",
    )


### Recording to Youtube ###
# TODO: Refine flow of video creation and product association in database.
# Currently, videos are creation in DB and associated with products on recording start.
# We should investigate whether it's better to save this on recording ending only.
# But how do we store the product id and description from recording start in the app state? Some smart caching?


@router.post(
    "/{camera_id}/stream/record/start", response_model=VideoRead, status_code=201, summary="Start recording to YouTube"
)
async def start_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    product_id: Annotated[PositiveInt, Body(description="ID of product to associate the video with")],
    title: Annotated[str | None, Body(description="Custom video title")] = None,
    description: Annotated[str | None, Body(description="Custom description for the video")] = None,
    privacy_status: Annotated[
        YouTubePrivacyStatus, Body(description="Privacy status for the YouTube video")
    ] = YouTubePrivacyStatus.PRIVATE,
) -> Video:
    """Start recording to YouTube. Video will be stored and can be associated with a product."""
    # TODO: Break down this function into smaller parts for better maintainability

    # Validate video data before starting stream
    if product_id is not None:
        await db_get_model_with_id_if_it_exists(session, Product, product_id)
    video = VideoCreate(
        url=HttpUrl("http://placeholder.com"),  # Will be updated with actual stream URL
        title=title,
        description=description,
        product_id=product_id,
    )

    # Get Google OAuth account
    oauth_account = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id, OAuthAccount.oauth_name == google_youtube_oauth_client.name
        )
    )
    if not oauth_account:
        raise HTTPException(
            403,
            "Google Oauth account association required for YouTube streaming. Use /api/auth/associate/google/authorize",
        )

    # Initialize YouTube service
    youtube_service = YouTubeService(oauth_account, google_youtube_oauth_client)

    # Create livestream
    now_str = serialize_datetime_with_z(datetime.now(UTC))
    title = title or f"Product {product_id} recording at {now_str}" if product_id else f"Recording at {now_str}"
    description = description or f"Recording {f'of product {product_id}' if product_id else ''} at {now_str}"

    youtube_config = await youtube_service.setup_livestream(
        title, privacy_status=privacy_status, description=description
    )

    # Fetch user camera
    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    # Start Youtube stream
    response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/start",
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        query_params=QueryParams({"mode": StreamMode.YOUTUBE.value}),
        body=youtube_config.model_dump(exclude={"stream_id"}),
    )
    try:
        stream_info = StreamView(**response.json())
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e

    # Validate stream is active
    await youtube_service.validate_stream_status(youtube_config.stream_id)

    # Update video with actual stream URL and store in database
    video.url = stream_info.url
    video.video_metadata = stream_info.metadata.model_dump()
    return await create_video(session, video)


@router.delete("/{camera_id}/stream/record/stop", summary="Stop recording to YouTube")
async def stop_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> dict[str, AnyUrl]:
    """Stop recording and save video to database."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    # Get current stream info before stopping
    stream_status_response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/status",
        method=HttpMethod.GET,
        error_msg="Failed to get stream status",
    )

    await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/stop",
        method=HttpMethod.DELETE,
        error_msg="Failed to stop stream",
        query_params=QueryParams({"mode": StreamMode.YOUTUBE.value}),
    )

    # TODO: Stop YouTube stream on YouTube API

    try:
        stream_info = StreamView(**stream_status_response.json())
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e
    else:
        return {"video_url": stream_info.url}


# TODO: Add Youtube livestream status monitoring endpoint using liveBroadcast.contentDetails.monitorStream


### Local stream preview ###
@router.post(
    "/{camera_id}/stream/preview/start", response_model=StreamView, status_code=201, summary="Start preview stream"
)
async def start_preview(camera_id: UUID4, session: AsyncSessionDep, current_user: CurrentActiveUserDep) -> StreamView:
    """Start local HLS preview stream. Stream will not be recorded."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/stream/start",
        method=HttpMethod.POST,
        error_msg="Failed to start stream",
        query_params=QueryParams({"mode": StreamMode.LOCAL.value}),
    )
    try:
        return StreamView(**response.json())
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e


@router.delete("/{camera_id}/stream/preview/stop", status_code=204, summary="Stop preview stream")
async def stop_preview(camera_id: UUID4, session: AsyncSessionDep, current_user: CurrentActiveUserDep) -> None:
    """Stop recording and save video to database."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    await fetch_from_camera_url(
        camera=camera,
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
    camera_id: UUID4, file_path: str, session: AsyncSessionDep, current_user: CurrentActiveUserDep
) -> Response:
    """Proxy HLS files from camera to client."""
    # TODO: Use StreamResponse here and in the RPI cam API instead of FileResponse
    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    response = await fetch_from_camera_url(
        camera=camera,
        endpoint=f"/stream/hls/{file_path}",
        method=HttpMethod.GET,
        error_msg=f"Failed to get HLS file {file_path}",
    )

    return Response(
        content=response.content,
        media_type=response.headers["content-type"],
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate"
            if file_path.endswith(".m3u8")  # Cache .ts segments but not playlists
            else f"max-age={MAX_PREVIEW_STREAM_LENGTH_SECONDS}",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get(
    "/{camera_id}/stream/preview/watch",
    response_class=HTMLResponse,
    summary="Watch preview stream",
    description="Returns HTML viewer for remote HLS stream.",
)
async def watch_preview(
    request: Request, camera_id: UUID4, session: AsyncSessionDep, current_user: CurrentActiveUserDep
) -> HTMLResponse:
    """Serve HLS stream viewer from camera.

    Note: HTML viewer makes authenticated requests directly to camera's stream endpoint.
    """
    # Validate camera ownership
    await get_user_owned_camera(session, camera_id, current_user.id)

    response = templates.TemplateResponse(
        "plugins/rpi_cam/remote_stream_viewer.html",
        {"request": request, "camera_id": camera_id, "hls_manifest_file": HLS_MANIFEST_FILENAME},
    )

    return response
