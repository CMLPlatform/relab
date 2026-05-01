"""Routers for the Raspberry Pi Camera plugin."""

import contextlib
import logging
from typing import TYPE_CHECKING, Annotated

from anyio import to_thread
from fastapi import Body, File, Form, HTTPException, UploadFile
from pydantic import UUID4, PositiveInt
from relab_rpi_cam_models import DeviceImageUploadAck, DevicePreviewThumbnailAck

from app.api.audiences import DeviceAPIRouter
from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.services.rate_limiter import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.exceptions import APIError, InternalServerError
from app.api.common.form_json import parse_required_json_object
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.media_queries import create_image
from app.api.file_storage.crud.support_uploads import validate_upload_size
from app.api.file_storage.models import Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateInternal, ImageRead
from app.api.file_storage.upload_policy import validate_image_upload_content
from app.api.plugins.rpi_cam.device_assertion import AuthenticatedCameraDep
from app.api.plugins.rpi_cam.examples import (
    CAMERA_CAPTURE_IMAGE_DESCRIPTION_OPENAPI_EXAMPLES,
    CAMERA_CAPTURE_IMAGE_PRODUCT_ID_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.runtime_capture import capture_and_store_image
from app.api.plugins.rpi_cam.runtime_preview import get_preview_thumbnail_path, get_preview_thumbnail_url
from app.core.config import settings
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)
router = PublicAPIRouter()
device_router = DeviceAPIRouter(tags=["rpi-cam-device"])
ZERO_SIZE_UPLOAD_MESSAGE = "File size is zero."
EMPTY_PREVIEW_UPLOAD_MESSAGE = "Preview thumbnail upload was empty"


def _unlink_quiet(path: Path) -> None:
    with contextlib.suppress(FileNotFoundError):
        path.unlink()


def _write_preview_thumbnail_atomic(path: Path, image_bytes: bytes) -> None:
    """Write preview thumbnail bytes atomically to the deterministic cache path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp_path.write_bytes(image_bytes)
        tmp_path.replace(path)
    except BaseException:
        _unlink_quiet(tmp_path)
        raise


### Images ###
@router.post(
    "/{camera_id}/captures",
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
        owner_id=camera.owner_id,
        description=description,
    )


### Device-pushed uploads ###


@device_router.post(
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
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
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
    capture_meta = parse_required_json_object(capture_metadata, field_name="capture_metadata")
    upload_meta = parse_required_json_object(upload_metadata, field_name="upload_metadata")

    product_id = upload_meta.get("product_id")
    if product_id is None:
        raise HTTPException(status_code=400, detail="upload_metadata must include a product_id")
    try:
        product_id_int = int(product_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="product_id must be an integer") from exc
    if product_id_int <= 0:
        raise HTTPException(status_code=400, detail="product_id must be a positive integer")

    await get_user_owned_object(session, Product, product_id_int, camera.owner_id)

    description = upload_meta.get("description") or f"Captured from camera {camera.name}."
    image_data = ImageCreateInternal(
        file=file,
        description=description,
        image_metadata=capture_meta,
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
        raise InternalServerError(
            log_message="Image stored but URL could not be computed; storage layer misconfigured.",
        )
    return DeviceImageUploadAck(image_id=image.id.hex, image_url=image_read.image_url)


@device_router.post(
    "/{camera_id}/preview-thumbnail-upload",
    response_model=DevicePreviewThumbnailAck,
    summary="Internal: receive a cached preview thumbnail pushed directly from a paired Raspberry Pi",
    description=(
        "Called by the Pi's background thumbnail worker. Authenticated with the same short-lived "
        "ES256 device assertion used by the WebSocket relay. Stores a deterministic per-camera JPEG "
        "cache file for camera-card previews without creating an Image database row."
    ),
    status_code=201,
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
)
async def receive_preview_thumbnail_upload(
    camera_id: UUID4,  # noqa: ARG001 — consumed by AuthenticatedCameraDep
    camera: AuthenticatedCameraDep,
    file: Annotated[UploadFile, File(description="Cached preview JPEG thumbnail")],
) -> DevicePreviewThumbnailAck:
    """Receive a cached preview thumbnail pushed from the Pi and persist it."""
    try:
        await validate_upload_size(file, settings.max_image_upload_size_mb)
        await to_thread.run_sync(validate_image_upload_content, file)
    except APIError as exc:
        if exc.message == ZERO_SIZE_UPLOAD_MESSAGE:
            raise HTTPException(status_code=400, detail=EMPTY_PREVIEW_UPLOAD_MESSAGE) from exc
        raise HTTPException(status_code=exc.http_status_code, detail=exc.message) from exc

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail=EMPTY_PREVIEW_UPLOAD_MESSAGE)

    logger.info("Receiving cached preview thumbnail from camera %s", camera.id)
    path = get_preview_thumbnail_path(camera.id)
    _write_preview_thumbnail_atomic(path, image_bytes)
    preview_thumbnail_url = get_preview_thumbnail_url(camera.id)
    if preview_thumbnail_url is None:
        raise InternalServerError(
            log_message="Preview thumbnail stored but URL could not be computed.",
        )
    return DevicePreviewThumbnailAck(preview_thumbnail_url=preview_thumbnail_url)
