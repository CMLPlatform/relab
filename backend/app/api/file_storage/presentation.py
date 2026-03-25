"""Presentation helpers for file storage models."""

from pathlib import Path
from urllib.parse import quote

from app.api.file_storage.models.models import File, Image
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.core.config import settings


def stored_file_path(item: File | Image) -> Path | None:
    """Return the storage path for a stored file-backed model."""
    file_field = getattr(item, "file", None)
    path = getattr(file_field, "path", None)
    return Path(path) if path else None


def storage_item_exists(item: File | Image) -> bool:
    """Return whether the backing file exists on disk."""
    file_path = stored_file_path(item)
    return file_path is not None and file_path.exists()


def build_file_url(file: File) -> str | None:
    """Build the public URL for a stored file."""
    file_path = stored_file_path(file)
    if file_path is None or not file_path.exists():
        return None

    relative_path = file_path.relative_to(settings.file_storage_path)
    return f"/uploads/files/{quote(str(relative_path))}"


def build_image_url(image: Image) -> str | None:
    """Build the public URL for a stored image."""
    image_path = stored_file_path(image)
    if image_path is None or not image_path.exists():
        return None

    relative_path = image_path.relative_to(settings.image_storage_path)
    return f"/uploads/images/{quote(str(relative_path))}"


def build_thumbnail_url(image: Image) -> str | None:
    """Build the public thumbnail URL for an image."""
    if image.id is None or stored_file_path(image) is None:
        return None
    return f"/images/{image.id}/resized?width=200"


def serialize_file_read(file: File) -> FileReadWithinParent:
    """Convert a file model to its API read schema."""
    return FileReadWithinParent.model_validate(
        {
            "id": file.db_id,
            "description": file.description,
            "filename": file.filename,
            "file_url": build_file_url(file),
            "created_at": file.created_at,
            "updated_at": file.updated_at,
        }
    )


def serialize_image_read(image: Image) -> ImageReadWithinParent:
    """Convert an image model to its API read schema."""
    return ImageReadWithinParent.model_validate(
        {
            "id": image.db_id,
            "description": image.description,
            "image_metadata": image.image_metadata,
            "filename": image.filename,
            "image_url": build_image_url(image),
            "thumbnail_url": build_thumbnail_url(image),
            "created_at": image.created_at,
            "updated_at": image.updated_at,
        }
    )
