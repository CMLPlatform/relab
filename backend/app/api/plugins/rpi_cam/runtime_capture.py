"""Runtime image-capture helper."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from pydantic import UUID4, PositiveInt
from relab_rpi_cam_models.images import ImageCaptureStatus
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.ownership import get_user_owned_object
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.exceptions import InvalidCameraResponseError
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import Response

logger = logging.getLogger(__name__)


async def capture_and_store_image(
    session: AsyncSession,
    *,
    camera_request: Callable[..., Awaitable[Response | RelayResponse]],
    product_id: PositiveInt,
    owner_id: UUID4,
    filename: str | None = None,
    description: str | None = None,
) -> Image:
    """Trigger a capture on the Pi and return the resulting stored ``Image``."""
    await get_user_owned_object(session, Product, product_id, owner_id)

    upload_metadata: dict[str, Any] = {"product_id": int(product_id)}
    if description is not None:
        upload_metadata["description"] = description
    if filename is not None:
        upload_metadata["filename"] = filename

    capture_response = await camera_request(
        endpoint="/captures",
        method=HttpMethod.POST,
        body=upload_metadata,
        error_msg="Failed to capture image",
    )
    try:
        capture_data = cast("dict[str, Any]", capture_response.json())
    except json.JSONDecodeError as e:
        body_preview = getattr(capture_response, "content", b"")[:200]
        logger.exception(
            "Camera returned non-JSON response for POST /captures (%d bytes): %r",
            len(getattr(capture_response, "content", b"")),
            body_preview,
        )
        raise InvalidCameraResponseError(
            details=f"Expected JSON, got {len(body_preview)} bytes: {body_preview!r}",
        ) from e

    status_value = str(capture_data.get("status") or ImageCaptureStatus.UPLOADED)
    if status_value == ImageCaptureStatus.QUEUED:
        raise InvalidCameraResponseError(
            details=(
                "Camera captured the image but the synchronous push to the backend failed; "
                "it was queued on the device for retry. Please try again."
            ),
        )
    if status_value != ImageCaptureStatus.UPLOADED:
        raise InvalidCameraResponseError(
            details=f"Camera returned an unknown capture status: {status_value!r}",
        )

    image_id_hex = capture_data.get("image_id")
    if not isinstance(image_id_hex, str):
        raise InvalidCameraResponseError(
            details=f"Camera response missing image_id: {capture_data!r}",
        )
    try:
        image_uuid = UUID(hex=image_id_hex)
    except ValueError as exc:
        raise InvalidCameraResponseError(
            details=f"Camera returned malformed image_id: {image_id_hex!r}",
        ) from exc

    image = await session.get(Image, image_uuid)
    if image is None:
        raise InvalidCameraResponseError(
            details=(
                f"Camera reported a successful upload but image {image_id_hex} was not found "
                "in the backend database — upload may have been written to a different session."
            ),
        )
    return image
