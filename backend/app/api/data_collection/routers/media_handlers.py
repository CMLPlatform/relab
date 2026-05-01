"""Shared media-handler bodies for product and component file/image routes.

Both ``/products/{id}/…`` (base-only) and ``/components/{id}/…`` mount the
same file/image surface. The handlers here take a resolved ``parent_id``
and do the work so both routers can be thin wrappers that differ only in
which ownership dep resolves the id.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import UploadFile

from app.api.auth.services.stats import refresh_profile_stats_after_mutation
from app.api.common.form_json import parse_optional_json_object
from app.api.data_collection.crud.storage import (
    create_product_file,
    create_product_image,
    delete_product_file,
    delete_product_image,
    get_product_file,
    get_product_image,
    list_product_files,
    list_product_images,
)
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
)

if TYPE_CHECKING:
    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.file_storage.filters import FileFilter, ImageFilter


def _product_file_create(parent_id: int, *, file: UploadFile, description: str | None) -> FileCreate:
    return FileCreate(
        file=file,
        description=description,
        parent_id=parent_id,
        parent_type=MediaParentType.PRODUCT,
    )


def _product_image_create(
    parent_id: int,
    *,
    file: UploadFile,
    description: str | None,
    image_metadata: str | None,
) -> ImageCreateFromForm:
    return ImageCreateFromForm.model_validate(
        {
            "file": file,
            "description": description,
            "image_metadata": parse_optional_json_object(image_metadata, field_name="image_metadata"),
            "parent_id": parent_id,
            "parent_type": MediaParentType.PRODUCT,
        }
    )


### File handlers ###
async def handle_list_files(
    session: AsyncSession, parent_id: int, item_filter: FileFilter
) -> list[FileReadWithinParent]:
    """List files attached to the given parent (product or component)."""
    items = await list_product_files(session, parent_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


async def handle_get_file(session: AsyncSession, parent_id: int, file_id: UUID4) -> FileReadWithinParent:
    """Fetch a single file attached to the given parent."""
    item = await get_product_file(session, parent_id, file_id)
    return FileReadWithinParent.model_validate(item)


async def handle_upload_file(
    session: AsyncSession, parent_id: int, *, file: UploadFile, description: str | None
) -> FileReadWithinParent:
    """Attach a new file to the given parent."""
    item = await create_product_file(
        session,
        parent_id,
        _product_file_create(parent_id, file=file, description=description),
    )
    return FileReadWithinParent.model_validate(item)


async def handle_delete_file(session: AsyncSession, parent_id: int, file_id: UUID4) -> None:
    """Detach and delete a file from the given parent."""
    await delete_product_file(session, parent_id, file_id)


### Image handlers ###


async def handle_list_images(
    session: AsyncSession, parent_id: int, item_filter: ImageFilter
) -> list[ImageReadWithinParent]:
    """List images attached to the given parent (product or component)."""
    items = await list_product_images(session, parent_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]


async def handle_get_image(session: AsyncSession, parent_id: int, image_id: UUID4) -> ImageReadWithinParent:
    """Fetch a single image attached to the given parent."""
    item = await get_product_image(session, parent_id, image_id)
    return ImageReadWithinParent.model_validate(item)


async def handle_upload_image(
    session: AsyncSession,
    parent_id: int,
    *,
    file: UploadFile,
    description: str | None,
    image_metadata: str | None,
    current_user: User,
) -> ImageReadWithinParent:
    """Attach a new image to the given parent and refresh user stats."""
    item = await create_product_image(
        session,
        parent_id,
        _product_image_create(parent_id, file=file, description=description, image_metadata=image_metadata),
    )
    await refresh_profile_stats_after_mutation(session, current_user.id)
    await session.commit()
    return ImageReadWithinParent.model_validate(item)


async def handle_delete_image(session: AsyncSession, parent_id: int, image_id: UUID4) -> None:
    """Detach an image and recompute stats for the owner.

    Components denormalize their base's owner_id, so the owner lookup here
    resolves correctly for either role.
    """
    product = await session.get(Product, parent_id)
    await delete_product_image(session, parent_id, image_id)
    if product and product.owner_id is not None:
        await refresh_profile_stats_after_mutation(session, product.owner_id)
        await session.commit()
