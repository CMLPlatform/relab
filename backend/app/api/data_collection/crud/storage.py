"""Product storage helpers."""

from typing import TYPE_CHECKING

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.parent_media import (
    create_parent_media,
    delete_all_parent_media,
    delete_parent_media,
    get_parent_media,
    list_parent_media,
)
from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.models import File, Image, MediaParentType

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.file_storage.filters import FileFilter, ImageFilter
    from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm


async def list_product_files(db: AsyncSession, product_id: int, *, filter_params: FileFilter) -> Sequence[File]:
    """List files attached to a product."""
    return await list_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=product_id,
        filter_params=filter_params,
    )


async def get_product_file(db: AsyncSession, product_id: int, file_id: UUID4) -> File:
    """Load one file attached to a product."""
    return await get_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=product_id,
        item_id=file_id,
    )


async def create_product_file(db: AsyncSession, product_id: int, payload: FileCreate) -> File:
    """Create a file attached to a product."""
    return await create_parent_media(
        db,
        parent_id=product_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=file_storage_service,
        item_data=payload,
    )


async def delete_product_file(db: AsyncSession, product_id: int, file_id: UUID4) -> None:
    """Delete a file attached to a product."""
    await delete_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=product_id,
        item_id=file_id,
        storage_service=file_storage_service,
    )


async def delete_all_product_files(db: AsyncSession, product_id: int) -> None:
    """Delete all files attached to a product."""
    await delete_all_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=File,
        parent_id=product_id,
        storage_service=file_storage_service,
    )


async def list_product_images(db: AsyncSession, product_id: int, *, filter_params: ImageFilter) -> Sequence[Image]:
    """List images attached to a product."""
    return await list_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=product_id,
        filter_params=filter_params,
    )


async def get_product_image(db: AsyncSession, product_id: int, image_id: UUID4) -> Image:
    """Load one image attached to a product."""
    return await get_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=product_id,
        item_id=image_id,
    )


async def create_product_image(db: AsyncSession, product_id: int, payload: ImageCreateFromForm) -> Image:
    """Create an image attached to a product."""
    return await create_parent_media(
        db,
        parent_id=product_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=image_storage_service,
        item_data=payload,
    )


async def delete_product_image(db: AsyncSession, product_id: int, image_id: UUID4) -> None:
    """Delete an image attached to a product."""
    await delete_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=product_id,
        item_id=image_id,
        storage_service=image_storage_service,
    )


async def delete_all_product_images(db: AsyncSession, product_id: int) -> None:
    """Delete all images attached to a product."""
    await delete_all_parent_media(
        db,
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        parent_id=product_id,
        storage_service=image_storage_service,
    )
