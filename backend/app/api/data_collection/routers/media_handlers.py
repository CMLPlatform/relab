"""Shared media-handler bodies for product and component file/image routes.

Both ``/products/{id}/…`` (base-only) and ``/components/{id}/…`` mount the
same file/image surface. The handlers here take a resolved ``parent_id``
and do the work so both routers can be thin wrappers that differ only in
which ownership dep resolves the id.
"""

from typing import TYPE_CHECKING, cast

from fastapi import UploadFile

from app.api.common.crud.pagination import paginate_select
from app.api.common.form_json import parse_optional_json_object
from app.api.data_collection.crud.profile_stats import recompute_user_profile_stats
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.parent_media import (
    create_parent_media,
    delete_parent_media,
    get_parent_media,
)
from app.api.file_storage.crud.support_paths import storage_item_exists
from app.api.file_storage.crud.support_services import (
    file_storage_service,
    image_storage_service,
    parent_media_select,
)
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
)

if TYPE_CHECKING:
    from fastapi_pagination.links import Page
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
) -> Page[FileReadWithinParent]:
    """List files attached to the given parent (product or component)."""
    statement = parent_media_select(
        File, parent_type=MediaParentType.PRODUCT, parent_id=parent_id, filter_params=item_filter
    )
    page = await paginate_select(
        session,
        statement,
        model=File,
        transform=lambda rows: [
            FileReadWithinParent.model_validate(item) for item in rows if storage_item_exists(item)
        ],
    )
    return cast("Page[FileReadWithinParent]", page)


async def handle_get_file(session: AsyncSession, parent_id: int, file_id: UUID4) -> FileReadWithinParent:
    """Fetch a single file attached to the given parent."""
    item = await get_parent_media(
        session,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=parent_id,
        item_id=file_id,
    )
    return FileReadWithinParent.model_validate(item)


async def handle_upload_file(
    session: AsyncSession, parent_id: int, *, file: UploadFile, description: str | None, current_user: User
) -> FileReadWithinParent:
    """Attach a new file to the given parent."""
    item = await create_parent_media(
        session,
        parent_id=parent_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=file_storage_service,
        item_data=_product_file_create(parent_id, file=file, description=description),
        quota_user_id=current_user.id,
    )
    return FileReadWithinParent.model_validate(item)


async def handle_delete_file(session: AsyncSession, parent_id: int, file_id: UUID4) -> None:
    """Detach and delete a file from the given parent."""
    await delete_parent_media(
        session,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=parent_id,
        item_id=file_id,
        storage_service=file_storage_service,
    )


### Image handlers ###


async def handle_list_images(
    session: AsyncSession, parent_id: int, item_filter: ImageFilter
) -> Page[ImageReadWithinParent]:
    """List images attached to the given parent (product or component)."""
    statement = parent_media_select(
        Image, parent_type=MediaParentType.PRODUCT, parent_id=parent_id, filter_params=item_filter
    )
    page = await paginate_select(
        session,
        statement,
        model=Image,
        transform=lambda rows: [
            ImageReadWithinParent.model_validate(item) for item in rows if storage_item_exists(item)
        ],
    )
    return cast("Page[ImageReadWithinParent]", page)


async def handle_get_image(session: AsyncSession, parent_id: int, image_id: UUID4) -> ImageReadWithinParent:
    """Fetch a single image attached to the given parent."""
    item = await get_parent_media(
        session,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=parent_id,
        item_id=image_id,
    )
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
    item = await create_parent_media(
        session,
        parent_id=parent_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=image_storage_service,
        item_data=_product_image_create(
            parent_id,
            file=file,
            description=description,
            image_metadata=image_metadata,
        ),
        quota_user_id=current_user.id,
    )
    await recompute_user_profile_stats(session, current_user.id)
    await session.commit()
    return ImageReadWithinParent.model_validate(item)


async def handle_delete_image(session: AsyncSession, parent_id: int, image_id: UUID4) -> None:
    """Detach an image and recompute stats for the owner.

    Components denormalize their base's owner_id, so the owner lookup here
    resolves correctly for either role.
    """
    product = await session.get(Product, parent_id)
    await delete_parent_media(
        session,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=parent_id,
        item_id=image_id,
        storage_service=image_storage_service,
    )
    if product and product.owner_id is not None:
        await recompute_user_profile_stats(session, product.owner_id)
        await session.commit()
