"""Routers for the Raspberry Pi Camera plugin."""

import json
import logging
from typing import TYPE_CHECKING, Annotated

from fastapi import Body, File, Form, HTTPException, UploadFile
from pydantic import UUID4, PositiveInt
from relab_rpi_cam_models import DeviceImageUploadAck

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.media_queries import create_image
from app.api.file_storage.models import Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateInternal, ImageRead
from app.api.plugins.rpi_cam.device_assertion import AuthenticatedCameraDep
from app.api.plugins.rpi_cam.examples import (
    CAMERA_CAPTURE_IMAGE_DESCRIPTION_OPENAPI_EXAMPLES,
    CAMERA_CAPTURE_IMAGE_PRODUCT_ID_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.services import capture_and_store_image
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from typing import Any

logger = logging.getLogger(__name__)
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
    redis: OptionalRedisDep,
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
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)

    return await capture_and_store_image(
        session,
        camera_request=camera_request,
        product_id=product_id,
        description=description,
    )


### Device-pushed uploads ###


@router.post(
    "/{camera_id}/image-upload",
    response_model=DeviceImageUploadAck,
    summary="Internal: receive an image pushed directly from a paired Raspberry Pi",
    description=(
        "Called by the Pi after a successful capture. Authenticated with a short-lived ES256 "
        "device assertion (same credential used by the WebSocket relay). The Pi provides the "
        "JPEG body plus two JSON blobs: `capture_metadata` (libcamera metadata) and "
        "`upload_metadata` (opaque dict forwarded by whichever caller triggered the capture — "
        "typically `{product_id, description}`). The backend stores the image via the normal "
        "image storage service and returns a tiny ack envelope the Pi consumes."
    ),
    status_code=201,
)
async def receive_camera_upload(
    camera_id: UUID4,  # noqa: ARG001 — consumed by AuthenticatedCameraDep
    camera: AuthenticatedCameraDep,
    session: AsyncSessionDep,
    file: Annotated[UploadFile, File(description="Captured JPEG")],
    capture_metadata: Annotated[str, Form(description="libcamera capture metadata as a JSON string")],
    upload_metadata: Annotated[str, Form(description="Parent association metadata as a JSON string")],
) -> DeviceImageUploadAck:
    """Receive a capture pushed from the Pi and persist it."""
    try:
        capture_meta: dict[str, Any] = json.loads(capture_metadata) or {}
        upload_meta: dict[str, Any] = json.loads(upload_metadata) or {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON metadata: {exc}") from exc

    product_id = upload_meta.get("product_id")
    if product_id is None:
        raise HTTPException(status_code=400, detail="upload_metadata must include a product_id")
    try:
        product_id_int = int(product_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="product_id must be an integer") from exc
    if product_id_int <= 0:
        raise HTTPException(status_code=400, detail="product_id must be a positive integer")

    await require_model(session, Product, product_id_int)

    description = upload_meta.get("description") or f"Captured from camera {camera.name}."
    # Stamp which camera took the image into the JSONB metadata so the mosaic
    # dashboard can efficiently find the most recent capture per camera
    # without adding a dedicated FK column + Alembic migration. See
    # ``services.get_last_image_url_per_camera``.
    capture_meta_with_camera = {**capture_meta, "camera_id": str(camera.id)}
    image_data = ImageCreateInternal(
        file=file,
        description=description,
        image_metadata=capture_meta_with_camera,
        parent_type=MediaParentType.PRODUCT,
        parent_id=product_id_int,
    )

    logger.info(
        "Receiving pushed image from camera %s for product %s (filename=%s)",
        camera.id,
        product_id_int,
        file.filename,
    )
    image = await create_image(session, image_data)

    # ImageRead computes the public `image_url` via a model_validator based on
    # the image's storage path. Round-trip through it to reuse that logic.
    image_read = ImageRead.model_validate(image)
    if image_read.image_url is None:
        raise HTTPException(
            status_code=500,
            detail="Image stored but URL could not be computed — storage layer misconfigured.",
        )
    return DeviceImageUploadAck(image_id=image.id.hex, image_url=image_read.image_url)
