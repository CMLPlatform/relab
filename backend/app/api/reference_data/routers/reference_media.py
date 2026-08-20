"""Route helpers for reference-data media."""

from typing import TYPE_CHECKING

from app.api.common.form_json import parse_optional_json_object
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import ImageCreateFromForm

if TYPE_CHECKING:
    from fastapi import UploadFile
    from pydantic import BaseModel
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.common.crud.filtering import BaseFilterSet
    from app.api.file_storage.crud.parent_media import ParentMediaCrud
    from app.api.file_storage.crud.support_types import StorageCreateSchema, StorageModel


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


async def list_reference_media_reads[StorageT: StorageModel, CreateT: StorageCreateSchema, ReadT: BaseModel](
    session: AsyncSession,
    media: ParentMediaCrud[StorageT, CreateT],
    parent_id: int,
    item_filter: BaseFilterSet,
    *,
    read_schema: type[ReadT],
) -> list[ReadT]:
    """List a parent's media (files or images) and convert each to the given read schema."""
    items = await media.get_all(session, parent_id, filter_params=item_filter)
    return [read_schema.model_validate(item) for item in items]
