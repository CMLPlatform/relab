"""Routers for the Raspberry Pi Camera plugin."""

from fastapi import Query
from httpx import QueryParams
from pydantic import UUID4, ValidationError
from relab_rpi_cam_models.camera import CameraMode

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.exceptions import InvalidCameraResponseError
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraStatus, CameraStatusDetails
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    build_camera_request,
    get_user_owned_camera,
)

router = PublicAPIRouter()


### Camera Management ###
@router.post("/{camera_id}/open", response_model=CameraStatus, summary="Initialize camera")
async def init_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
    mode: CameraMode = Query(default=CameraMode.PHOTO, description="Camera mode (photo or video)"),
) -> CameraStatus:
    """Initialize camera for a given use mode (photo or video)."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, http_client)
    camera_request = build_camera_request(camera, http_client)
    response = await camera_request(
        endpoint="/camera/open",
        method=HttpMethod.POST,
        error_msg="Failed to open camera",
        query_params=QueryParams({"mode": mode.value}),
    )
    try:
        return CameraStatus(connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json()))
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e


@router.post("/{camera_id}/close", summary="Close camera")
async def close_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> CameraStatus:
    """Close camera and free resources."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, http_client)
    camera_request = build_camera_request(camera, http_client)
    response = await camera_request(
        endpoint="/camera/close",
        method=HttpMethod.POST,
        error_msg="Failed to close camera",
    )
    try:
        return CameraStatus(connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json()))
    except ValidationError as e:
        raise InvalidCameraResponseError(e.json()) from e
