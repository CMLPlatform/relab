"""Runtime preview thumbnail helpers."""

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import UUID4

from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)

PREVIEW_THUMBNAIL_SUBDIR = "rpi-cam-preview"


def get_preview_thumbnail_path(camera_id: UUID4) -> Path:
    """Return the deterministic backend storage path for one camera's preview thumbnail.

    Stored in a private sibling of the public image mount (not under
    ``image_storage_path``) so preview frames are never reachable through the
    unauthenticated ``/uploads/images`` static mount — they are a live view of a
    private workspace and must go through the owner-checked preview route.
    """
    return settings.image_storage_path.parent / PREVIEW_THUMBNAIL_SUBDIR / f"{camera_id}.jpg"


def remove_preview_thumbnail(path: Path) -> None:
    """Best-effort cleanup of a camera's cached preview thumbnail file."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove preview thumbnail at %s", path)


def get_preview_thumbnail_url(camera_id: UUID4) -> str | None:
    """Return the owner-checked API URL for one camera's cached preview when present.

    Points at the authenticated ``GET /cameras/{id}/preview-thumbnail`` route
    rather than the public static mount. The ``?v=`` mtime lets the client cache
    bust when the frame changes without any long-lived immutable caching.
    """
    path = get_preview_thumbnail_path(camera_id)
    try:
        mtime = int(path.stat().st_mtime)
    except FileNotFoundError:
        return None
    return f"/v1/plugins/rpi-cam/cameras/{camera_id}/preview-thumbnail?v={mtime}"


def get_preview_thumbnail_urls_per_camera(camera_ids: list[UUID4]) -> dict[UUID, str | None]:
    """Return deterministic preview-thumbnail URLs for the given cameras."""
    return {UUID(str(camera_id)): get_preview_thumbnail_url(camera_id) for camera_id in camera_ids}
