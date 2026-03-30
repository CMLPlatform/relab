"""Presentation helpers for file storage models."""

from pathlib import Path

from app.api.file_storage.models.models import File, Image


def stored_file_path(item: File | Image) -> Path | None:
    """Return the storage path for a stored file-backed model."""
    file_field = getattr(item, "file", None)
    path = getattr(file_field, "path", None)
    return Path(path) if path else None


def storage_item_exists(item: File | Image) -> bool:
    """Return whether the backing file exists on disk."""
    file_path = stored_file_path(item)
    return file_path is not None and file_path.exists()
