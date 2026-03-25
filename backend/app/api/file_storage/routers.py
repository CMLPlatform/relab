"""Routers for file storage models, including image resizing."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Annotated

from anyio import Path as AsyncPath
from anyio import to_thread
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import UUID4

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.crud import get_image
from app.core.constants import HOUR
from app.core.images import resize_image
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from typing import NoReturn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/images", tags=["images"])

MEDIA_TYPE_WEBP = "image/webp"


@router.get("/{image_id}/resized", summary="Get a resized version of an image")
async def get_resized_image(
    request: Request,
    image_id: UUID4,
    session: AsyncSessionDep,
    width: Annotated[int | None, Query(gt=0, le=2000)] = 200,
    height: Annotated[int | None, Query(gt=0, le=2000)] = None,
) -> Response:
    """Get a resized version of an image as WebP.

    The image is resized while maintaining its aspect ratio.
    Resizing is performed in a background thread to avoid blocking the event loop.
    Results are cached via HTTP Cache-Control headers for 1 hour.
    """

    def _raise_not_found(detail: str) -> NoReturn:
        raise HTTPException(status_code=404, detail=detail)

    def _raise_error(detail: str, exc: Exception | None = None) -> NoReturn:
        if exc:
            raise HTTPException(status_code=500, detail=detail) from exc
        raise HTTPException(status_code=500, detail=detail)

    try:
        db_image = await get_image(session, image_id)
        if not db_image.file or not db_image.file.path:
            _raise_not_found("Image file not found in storage")

        image_path = AsyncPath(db_image.file.path)
        if not await image_path.exists():
            _raise_not_found("Image file not found on disk")

        # Resize the image in a separate thread to avoid blocking the event loop.
        # Use the capacity limiter from app.state to bound concurrent resize workers.
        limiter = getattr(request.app.state, "image_resize_limiter", None)
        resized_bytes = await to_thread.run_sync(resize_image, image_path, width, height, limiter=limiter)

        # Return response with HTTP cache headers for browser/CDN caching
        return Response(
            content=resized_bytes,
            media_type=MEDIA_TYPE_WEBP,
            headers={"Cache-Control": f"public, max-age={HOUR}, immutable"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error resizing image %s", sanitize_log_value(image_id))
        _raise_error("Error resizing image", exc=e)
