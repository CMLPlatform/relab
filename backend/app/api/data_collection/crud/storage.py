"""Product storage helpers."""

import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.parent_media import (
    create_parent_media,
    delete_parent_media,
    get_parent_media,
    list_parent_media,
)
from app.api.file_storage.crud.support_paths import (
    delete_file_from_storage,
    delete_image_from_storage,
    stored_file_path,
)
from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.models import File, Image, MediaParentType

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.file_storage.filters import FileFilter, ImageFilter
    from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm

logger = logging.getLogger(__name__)

type ProductMediaStorageDelete = Callable[[Path], Awaitable[None]]
type ProductMediaStorageCleanup = tuple[Path, ProductMediaStorageDelete]


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


async def create_product_file(
    db: AsyncSession,
    product_id: int,
    payload: FileCreate,
    *,
    quota_user_id: UUID | None = None,
) -> File:
    """Create a file attached to a product."""
    return await create_parent_media(
        db,
        parent_id=product_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=file_storage_service,
        item_data=payload,
        quota_user_id=quota_user_id,
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


async def create_product_image(
    db: AsyncSession,
    product_id: int,
    payload: ImageCreateFromForm,
    *,
    quota_user_id: UUID | None = None,
) -> Image:
    """Create an image attached to a product."""
    return await create_parent_media(
        db,
        parent_id=product_id,
        parent_type=MediaParentType.PRODUCT,
        storage_service=image_storage_service,
        item_data=payload,
        quota_user_id=quota_user_id,
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


async def delete_product_media(db: AsyncSession, product_id: int) -> list[ProductMediaStorageCleanup]:
    """Stage product media rows for deletion and return post-commit storage cleanup targets."""
    cleanups: list[ProductMediaStorageCleanup] = []
    for storage_model, delete_from_storage in (
        (File, delete_file_from_storage),
        (Image, delete_image_from_storage),
    ):
        result = await db.execute(
            select(storage_model).where(
                storage_model.parent_id == product_id,
                storage_model.parent_type == MediaParentType.PRODUCT,
            )
        )
        for item in result.scalars().all():
            if file_path := stored_file_path(item):
                cleanups.append((file_path, delete_from_storage))
            await db.delete(item)
    return cleanups


async def cleanup_product_media_storage(cleanups: list[ProductMediaStorageCleanup]) -> None:
    """Best-effort cleanup of storage bytes after product media DB rows have committed."""
    for file_path, delete_from_storage in cleanups:
        try:
            await delete_from_storage(file_path)
        except OSError:
            logger.warning("Product media storage cleanup failed after product deletion.", exc_info=True)
