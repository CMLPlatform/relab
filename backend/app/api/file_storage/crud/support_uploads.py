"""Upload validation and filename helpers for stored media."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from anyio import to_thread
from fastapi import UploadFile
from pydantic import UUID4
from slugify import slugify

from app.api.common.exceptions import BadRequestError
from app.api.file_storage.exceptions import UploadTooLargeError
from app.api.file_storage.schemas import ImageCreateFromForm, ImageCreateInternal

from .support_types import StorageCreateSchema, StorageModel

if TYPE_CHECKING:
    from typing import BinaryIO


def sanitize_filename(filename: str, max_length: int = 42) -> str:
    """Preserve all suffixes while sanitizing the base name."""
    path = Path(filename)
    name = path.name

    for suffix in path.suffixes[::-1]:
        name = name.removesuffix(suffix)

    sanitized_filename = slugify(
        name[:-1] + "_" if len(name) > max_length else name,
        lowercase=False,
        max_length=max_length,
        word_boundary=True,
    )

    return f"{sanitized_filename}{''.join(path.suffixes)}"


def process_uploadfile_name(file: UploadFile) -> tuple[UploadFile, UUID4, str, str]:
    """Process an UploadFile for storing in the database.

    Returns the (file, file_id, original_filename, stored_filename) tuple. ``stored_filename``
    is the prefixed name assigned to ``file.filename`` — returning it lets callers use a
    narrowly-typed ``str`` instead of the ``str | None`` attribute.
    """
    if file.filename is None:
        msg = "File name is empty."
        raise BadRequestError(msg)

    original_filename = sanitize_filename(file.filename)
    file_id = uuid.uuid4()
    stored_filename = f"{file_id.hex}_{original_filename}"
    file.filename = stored_filename
    return file, file_id, original_filename, stored_filename


def _measure_file_size(file: BinaryIO) -> int:
    """Measure a binary file object without changing its current position."""
    current_position = file.tell()
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(current_position)
    return file_size


async def validate_upload_size(upload_file: UploadFile, max_size_mb: int) -> None:
    """Validate upload size, even when UploadFile.size is unavailable."""
    file_size = upload_file.size
    if file_size is None:
        file_size = await to_thread.run_sync(_measure_file_size, upload_file.file)

    if file_size == 0:
        msg = "File size is zero."
        raise BadRequestError(msg)
    if file_size > max_size_mb * 1024 * 1024:
        raise UploadTooLargeError(file_size_bytes=file_size, max_size_mb=max_size_mb)


def build_storage_instance[StorageModelT: StorageModel](
    *,
    model: type[StorageModelT],
    file_id: UUID4,
    original_filename: str,
    stored_name: str,
    payload: StorageCreateSchema,
) -> StorageModelT:
    """Create a storage model instance from an upload payload."""
    item_kwargs: dict[str, Any] = {
        "id": file_id,
        "description": payload.description,
        "filename": original_filename,
        "file": stored_name,
        "parent_type": payload.parent_type,
        "parent_id": payload.parent_id,
    }
    if isinstance(payload, ImageCreateFromForm | ImageCreateInternal):
        item_kwargs["image_metadata"] = payload.image_metadata

    return model(**item_kwargs)
