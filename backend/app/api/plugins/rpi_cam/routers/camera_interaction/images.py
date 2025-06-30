"""Routers for the Raspberry Pi Camera plugin."""

from typing import Annotated

from fastapi import Body
from pydantic import UUID4, PositiveInt

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.file_storage.models.models import Image
from app.api.file_storage.schemas import ImageRead
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import get_user_owned_camera
from app.api.plugins.rpi_cam.services import capture_and_store_image

# TODO improve exception handling, add custom exceptions and return more granular HTTP codes
# (.e.g. 404 on missing camera, 403 on unauthorized access)


router = PublicAPIRouter()


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
    current_user: CurrentActiveUserDep,
    *,
    product_id: Annotated[PositiveInt, Body(description="ID of product to associate the image with")],
    description: Annotated[str | None, Body(description="Custom description for the image", max_length=500)] = None,
) -> Image:
    """Capture a still image with a remote Raspberry Pi Camera."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id)

    return await capture_and_store_image(session, camera, product_id=product_id, description=description)
