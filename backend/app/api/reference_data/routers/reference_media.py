"""Route helpers for reference-data media."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.form_json import parse_optional_json_object
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import FileCreate, FileReadWithinParent, ImageCreateFromForm, ImageReadWithinParent

if TYPE_CHECKING:
    from fastapi import UploadFile
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.file_storage.crud.parent_media import ParentMediaCrud
    from app.api.file_storage.filters import FileFilter, ImageFilter
    from app.api.file_storage.models import File, Image


def reference_file_create(
    parent_id: int,
    *,
    parent_type: MediaParentType,
    file: UploadFile,
    description: str | None,
) -> FileCreate:
    """Build the canonical reference-data file payload."""
    return FileCreate(
        file=file,
        description=description,
        parent_id=parent_id,
        parent_type=parent_type,
    )


def reference_image_create(
    parent_id: int,
    *,
    parent_type: MediaParentType,
    file: UploadFile,
    description: str | None,
    image_metadata: str | None,
) -> ImageCreateFromForm:
    """Build the canonical reference-data image payload."""
    return ImageCreateFromForm.model_validate(
        {
            "file": file,
            "description": description,
            "image_metadata": parse_optional_json_object(image_metadata, field_name="image_metadata"),
            "parent_id": parent_id,
            "parent_type": parent_type,
        }
    )


async def list_reference_file_reads(
    session: AsyncSession,
    files: ParentMediaCrud[File, FileCreate],
    parent_id: int,
    item_filter: FileFilter,
) -> list[FileReadWithinParent]:
    """List files and convert them to the scoped read schema."""
    items = await files.get_all(session, parent_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


async def list_reference_image_reads(
    session: AsyncSession,
    images: ParentMediaCrud[Image, ImageCreateFromForm],
    parent_id: int,
    item_filter: ImageFilter,
) -> list[ImageReadWithinParent]:
    """List images and convert them to the scoped read schema."""
    items = await images.get_all(session, parent_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]
