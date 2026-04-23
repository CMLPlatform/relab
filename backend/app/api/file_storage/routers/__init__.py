"""Routers for file storage models, including image resizing."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

from anyio import Path as AsyncPath
from anyio import to_thread
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import UUID4

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import mark_router_routes_public
from app.api.file_storage.crud.media_queries import get_image
from app.api.file_storage.examples import (
    IMAGE_RESIZE_HEIGHT_OPENAPI_EXAMPLES,
    IMAGE_RESIZE_WIDTH_OPENAPI_EXAMPLES,
)
from app.core.constants import HOUR
from app.core.images import THUMBNAIL_WIDTHS, resize_image, thumbnail_path_for
from app.core.logging import sanitize_log_value
from app.core.runtime import get_connection_image_resize_limiter

if TYPE_CHECKING:
    from typing import NoReturn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/images", tags=["images"])

MEDIA_TYPE_WEBP = "image/webp"


def _trusted_thumbnail_width(width: int | None) -> int | None:
    """Return a configured thumbnail width rather than a raw query value."""
    return next((thumbnail_width for thumbnail_width in THUMBNAIL_WIDTHS if width == thumbnail_width), None)


@router.get("/{image_id}/resized", summary="Get a resized version of an image")
async def get_resized_image(
    request: Request,
    image_id: UUID4,
    session: AsyncSessionDep,
    width: Annotated[
        int | None,
        Query(gt=0, le=2000, openapi_examples=IMAGE_RESIZE_WIDTH_OPENAPI_EXAMPLES),
    ] = 200,
    height: Annotated[
        int | None,
        Query(gt=0, le=2000, openapi_examples=IMAGE_RESIZE_HEIGHT_OPENAPI_EXAMPLES),
    ] = None,
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

    cache_headers = {"Cache-Control": f"public, max-age={HOUR}, immutable"}

    try:
        db_image = await get_image(session, image_id)
        if not db_image.file or not db_image.file.path:
            _raise_not_found("Image file not found in storage")

        image_path = AsyncPath(db_image.file.path)
        if not await image_path.exists():
            _raise_not_found("Image file not found on disk")

        # Serve pre-computed thumbnail when the request matches a standard width
        thumbnail_width = _trusted_thumbnail_width(width)
        if thumbnail_width is not None and not height:
            thumb = AsyncPath(thumbnail_path_for(Path(image_path), thumbnail_width))
            if await thumb.exists():
                content = await thumb.read_bytes()
                return Response(content=content, media_type=MEDIA_TYPE_WEBP, headers=cache_headers)

        # Fall back to on-demand resize for non-standard sizes
        limiter = get_connection_image_resize_limiter(request)
        resized_bytes = await to_thread.run_sync(resize_image, image_path, width, height, limiter=limiter)

        return Response(
            content=resized_bytes,
            media_type=MEDIA_TYPE_WEBP,
            headers=cache_headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error resizing image %s", sanitize_log_value(image_id))
        _raise_error("Error resizing image", exc=e)


mark_router_routes_public(router)
