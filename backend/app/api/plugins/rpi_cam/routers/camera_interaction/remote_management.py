"""Routers for the Raspberry Pi Camera plugin."""

import json

from fastapi import HTTPException, Query
from httpx import QueryParams
from pydantic import UUID4, ValidationError

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraMode, CameraStatus, CameraStatusDetails
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    fetch_from_camera_url,
    get_user_owned_camera,
)

# TODO improve exception handling, add custom exceptions and return more granular HTTP codes
# (.e.g. 404 on missing camera, 403 on unauthorized access)


router = PublicAPIRouter()


### Camera Management ###
@router.post("/{camera_id}/open", response_model=CameraStatus, summary="Initialize camera")
async def init_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    mode: CameraMode = Query(default=CameraMode.PHOTO, description="Camera mode (photo or video)"),
) -> CameraStatus:
    """Initialize camera for a given use mode (photo or video)."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/camera/open",
        method=HttpMethod.POST,
        error_msg="Failed to open camera",
        query_params=QueryParams({"mode": mode.value}),
    )
    try:
        return CameraStatus(connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json()))
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e


@router.post("/{camera_id}/close", summary="Close camera")
async def close_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> CameraStatus:
    """Close camera and free resources."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)
    response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/camera/close",
        method=HttpMethod.POST,
        error_msg="Failed to close camera",
    )
    try:
        return CameraStatus(connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json()))
    except ValidationError as e:
        raise HTTPException(status_code=424, detail=f"Invalid response from camera: {json.loads(e.json())}") from e
