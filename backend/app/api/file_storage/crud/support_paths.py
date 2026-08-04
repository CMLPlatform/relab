"""Path and deletion helpers for stored media."""

from pathlib import Path

from anyio import Path as AnyIOPath
from anyio import to_thread

from app.api.file_storage.models import File, Image
from app.core.images import delete_thumbnails


def _raw_storage_path(item: File | Image) -> str | None:
    """Return the raw stored path/URL for a file-backed model, if any."""
    file_field = getattr(item, "file", None)
    path = getattr(file_field, "path", None)
    return str(path) if path else None


def _is_remote_storage_path(path: str) -> bool:
    """Return whether a stored path is a remote URL (S3 backend) rather than a local file."""
    return path.startswith(("http://", "https://"))


def stored_file_path(item: File | Image) -> Path | None:
    """Return the local filesystem path for a stored model, or None.

    Returns None for the S3 backend, whose ``get_path`` yields a URL rather than a local
    path — every caller here (processing, thumbnailing, local deletion) is a filesystem
    operation that must be skipped for a remote object.
    """
    path = _raw_storage_path(item)
    if path is None or _is_remote_storage_path(path):
        return None
    return Path(path)


def storage_item_exists(item: File | Image) -> bool:
    """Return whether the backing file is present.

    A remote (S3) object is treated as present: the record's existence means it was
    uploaded, and ``Path(url).exists()`` would otherwise be False, hiding every S3-backed
    item from media listings.
    """
    path = _raw_storage_path(item)
    if path is None:
        return False
    if _is_remote_storage_path(path):
        return True
    return Path(path).exists()


async def delete_file_from_storage(file_path: Path) -> None:
    """Delete a file from the filesystem."""
    async_path = AnyIOPath(str(file_path))
    try:
        await async_path.unlink()
    except FileNotFoundError:
        return


async def delete_image_from_storage(image_path: Path) -> None:
    """Delete an image and any generated thumbnails from the filesystem."""
    await to_thread.run_sync(delete_thumbnails, image_path)
    await delete_file_from_storage(image_path)
