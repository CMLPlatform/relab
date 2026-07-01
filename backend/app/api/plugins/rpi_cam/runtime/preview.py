"""Runtime preview thumbnail helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import UUID4

from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

PREVIEW_THUMBNAIL_SUBDIR = "rpi-cam-preview"


def get_preview_thumbnail_path(camera_id: UUID4) -> Path:
    """Return the deterministic backend storage path for one camera's preview thumbnail."""
    return settings.image_storage_path / PREVIEW_THUMBNAIL_SUBDIR / f"{camera_id}.jpg"


def get_preview_thumbnail_url(camera_id: UUID4) -> str | None:
    """Return the public URL for one camera's cached preview thumbnail when present."""
    path = get_preview_thumbnail_path(camera_id)
    try:
        mtime = int(path.stat().st_mtime)
    except FileNotFoundError:
        return None
    relative_path = path.relative_to(settings.image_storage_path)
    return f"/uploads/images/{relative_path.as_posix()}?v={mtime}"


def get_preview_thumbnail_urls_per_camera(camera_ids: list[UUID4]) -> dict[UUID, str | None]:
    """Return deterministic preview-thumbnail URLs for the given cameras."""
    return {UUID(str(camera_id)): get_preview_thumbnail_url(camera_id) for camera_id in camera_ids}
