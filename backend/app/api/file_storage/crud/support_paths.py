"""Path and deletion helpers for stored media."""

from __future__ import annotations

from pathlib import Path

from anyio import Path as AnyIOPath
from anyio import to_thread

from app.api.file_storage.models import File, Image
from app.core.images import delete_thumbnails


def stored_file_path(item: File | Image) -> Path | None:
    """Return the storage path for a stored file-backed model."""
    file_field = getattr(item, "file", None)
    path = getattr(file_field, "path", None)
    return Path(path) if path else None


def storage_item_exists(item: File | Image) -> bool:
    """Return whether the backing file exists on disk."""
    file_path = stored_file_path(item)
    return file_path is not None and file_path.exists()


async def delete_file_from_storage(file_path: Path) -> None:
    """Delete a file from the filesystem."""
    async_path = AnyIOPath(str(file_path))
    if await async_path.exists():
        await async_path.unlink()


async def delete_image_from_storage(image_path: Path) -> None:
    """Delete an image and any generated thumbnails from the filesystem."""
    await to_thread.run_sync(delete_thumbnails, image_path)
    await delete_file_from_storage(image_path)
