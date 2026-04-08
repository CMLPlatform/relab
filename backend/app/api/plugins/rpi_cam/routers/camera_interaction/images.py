"""Routers for the Raspberry Pi Camera plugin."""

from typing import Annotated

from fastapi import Body
from fastapi.responses import Response, StreamingResponse
from pydantic import UUID4, PositiveInt

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.file_storage.models import Image
from app.api.file_storage.schemas import ImageRead
from app.api.plugins.rpi_cam.examples import (
    CAMERA_CAPTURE_IMAGE_DESCRIPTION_OPENAPI_EXAMPLES,
    CAMERA_CAPTURE_IMAGE_PRODUCT_ID_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    build_camera_request,
    get_user_owned_camera,
    stream_from_camera_url,
)
from app.api.plugins.rpi_cam.services import capture_and_store_image

router = PublicAPIRouter()


### Snapshot (viewfinder preview) ###
@router.get(
    "/{camera_id}/snapshot",
    summary="Get a low-res JPEG snapshot for viewfinder preview",
    description="Fetches a single low-resolution frame from the camera without saving it. "
    "Poll this endpoint at 1-2 fps to build a live viewfinder preview.",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}}, "description": "JPEG snapshot"}},
)
async def get_camera_snapshot(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> Response:
    """Return a low-res JPEG snapshot from the camera, without storing it."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, http_client)
    camera_request = build_camera_request(camera, http_client)
    response = await camera_request(
        endpoint="/images/preview",
        method=HttpMethod.GET,
        error_msg="Failed to get preview snapshot",
        expect_binary=True,
    )
    return Response(
        content=response.content,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


### MJPEG stream (web viewfinder) ###
@router.get(
    "/{camera_id}/stream/mjpeg",
    summary="Proxy MJPEG stream from RPi camera (HTTP cameras only)",
    description="Streams continuous MJPEG frames for live viewfinder preview. "
    "WebSocket-relay cameras are not supported (returns 501).",
    responses={200: {"content": {"multipart/x-mixed-replace; boundary=frame": {}}}},
)
async def stream_camera_mjpeg(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
) -> StreamingResponse:
    """Proxy MJPEG stream from an HTTP-mode RPi camera."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, http_client)
    return await stream_from_camera_url(
        camera=camera,
        endpoint="/images/mjpeg",
        method=HttpMethod.GET,
        http_client=http_client,
        error_msg="Failed to start MJPEG stream",
    )


### Images ###
@router.post(
    "/{camera_id}/image",
    response_model=ImageRead,
    summary="Capture a still image with a remote Raspberry Pi Camera",
    description=(
        "Capture a still image with a remote Raspberry Pi Camera and store it in the file storage."
        " Send optional parent type and ID in the request body to associate the image with another object."
    ),
    status_code=201,
)
async def capture_image(
    camera_id: UUID4,
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
    *,
    product_id: Annotated[
        PositiveInt,
        Body(
            description="ID of product to associate the image with",
            openapi_examples=CAMERA_CAPTURE_IMAGE_PRODUCT_ID_OPENAPI_EXAMPLES,
        ),
    ],
    description: Annotated[
        str | None,
        Body(
            description="Custom description for the image",
            max_length=500,
            openapi_examples=CAMERA_CAPTURE_IMAGE_DESCRIPTION_OPENAPI_EXAMPLES,
        ),
    ] = None,
) -> Image:
    """Capture a still image with a remote Raspberry Pi Camera."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, http_client)
    camera_request = build_camera_request(camera, http_client)

    return await capture_and_store_image(
        session,
        camera,
        camera_request=camera_request,
        product_id=product_id,
        description=description,
    )
