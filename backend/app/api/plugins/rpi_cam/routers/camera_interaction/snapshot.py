"""Snapshot forwarding for the Raspberry Pi Camera plugin."""

from fastapi import HTTPException, Response
from pydantic import UUID4

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    build_camera_request,
    get_user_owned_camera,
)
from app.core.redis import OptionalRedisDep

router = PublicAPIRouter()


@router.get(
    "/{camera_id}/snapshot",
    summary="Get a low-res JPEG snapshot for viewfinder preview",
    description=(
        "Fetch a single low-resolution frame from the camera without saving it. "
        "Returns 409 while the camera is actively streaming to YouTube."
    ),
)
async def get_camera_snapshot(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: OptionalRedisDep,
) -> Response:
    """Return a low-resolution JPEG snapshot from the camera."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)
    relay_response = await camera_request(
        endpoint="/snapshot",
        method=HttpMethod.GET,
        error_msg="Failed to fetch camera snapshot",
        expect_binary=True,
    )
    if relay_response.status_code == 409:
        raise HTTPException(status_code=409, detail="Preview unavailable while the camera is streaming.")
    return Response(content=relay_response.content, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
