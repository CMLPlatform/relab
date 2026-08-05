"""Path and deletion helpers for stored media."""

from pathlib import Path

from anyio import to_thread

from app.api.file_storage.models import File, Image
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.core.images import delete_thumbnails, image_resize_limiter


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


async def delete_file_from_storage(item: File) -> None:
    """Delete a file's stored bytes via its storage backend.

    Routes through ``BaseStorage.delete`` (filesystem or S3) rather than a raw
    ``Path.unlink`` so S3-backed objects — for which ``stored_file_path`` has no
    local path to unlink — are actually removed.
    """
    await _get_file_storage().delete(item.file.name)


async def delete_image_from_storage(item: Image) -> None:
    """Delete an image's stored bytes and any locally generated thumbnails.

    Thumbnails are filesystem-only (``stored_file_path`` is ``None`` for a
    remote/S3-backed image), so they're only cleaned up when a local path exists.
    """
    image_path = stored_file_path(item)
    if image_path is not None:
        await to_thread.run_sync(delete_thumbnails, image_path, limiter=image_resize_limiter())
    await _get_image_storage().delete(item.file.name)
