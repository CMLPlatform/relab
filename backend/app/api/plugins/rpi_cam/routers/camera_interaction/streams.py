"""Camera stream interaction routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Body
from pydantic import UUID4, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import StreamView

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.api.file_storage.schemas import VideoRead
from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT, HttpMethod
from app.api.plugins.rpi_cam.examples import (
    CAMERA_START_RECORDING_DESCRIPTION_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_PRIVACY_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_PRODUCT_ID_OPENAPI_EXAMPLES,
    CAMERA_START_RECORDING_TITLE_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.exceptions import InvalidCameraResponseError
from app.api.plugins.rpi_cam.recording_service import (
    get_youtube_recording_monitor_stream,
    start_youtube_recording,
    stop_youtube_recording,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.youtube import YouTubePrivacyStatus
from app.core.redis import RedisDep

# Initialize router
router = PublicAPIRouter()


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
    redis: RedisDep,
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


@router.post(
    "/{camera_id}/recording-stream", response_model=StreamView, status_code=201, summary="Start recording to YouTube"
)
async def start_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: RedisDep,
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
    """Start a YouTube recording stream."""
    return await start_youtube_recording(
        camera_id=camera_id,
        session=session,
        http_client=http_client,
        redis=redis,
        current_user=current_user,
        product_id=product_id,
        title=title,
        description=description,
        privacy_status=privacy_status,
    )


@router.delete(
    "/{camera_id}/recording-stream",
    response_model=VideoRead,
    summary="Stop recording to YouTube",
)
async def stop_recording(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: RedisDep,
    current_user: CurrentActiveUserDep,
) -> VideoRead:
    """Stop the active YouTube recording and return its video record."""
    return await stop_youtube_recording(
        camera_id=camera_id,
        session=session,
        http_client=http_client,
        redis=redis,
        current_user=current_user,
    )


@router.get(
    "/{camera_id}/recording-stream/monitor",
    response_model=YouTubeMonitorStreamResponse,
    summary="Get YouTube livestream monitor stream",
)
async def get_recording_monitor_stream(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    redis: RedisDep,
    current_user: CurrentActiveUserDep,
) -> YouTubeMonitorStreamResponse:
    """Get the YouTube monitor stream for the active backend-owned recording session."""
    return await get_youtube_recording_monitor_stream(
        camera_id=camera_id,
        session=session,
        http_client=http_client,
        redis=redis,
        current_user=current_user,
    )
