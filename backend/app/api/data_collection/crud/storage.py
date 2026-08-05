"""Product storage helpers for cascade deletion."""

import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.support_paths import delete_file_from_storage, delete_image_from_storage
from app.api.file_storage.models import File, Image, MediaParentType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

type ProductMediaStorageDelete = Callable[[File | Image], Awaitable[None]]
type ProductMediaStorageCleanup = tuple[File | Image, ProductMediaStorageDelete]


async def delete_product_media(db: AsyncSession, product_id: int) -> list[ProductMediaStorageCleanup]:
    """Stage product media rows for deletion and return post-commit storage cleanup targets.

    Covers the whole subtree: components cascade-delete with the product, so their
    media bytes must be staged for cleanup too, not just the root product's.
    """
    subtree = select(Product.id).where(Product.id == product_id).cte("product_subtree", recursive=True)
    subtree = subtree.union_all(select(Product.id).where(Product.parent_id == subtree.c.id))

    cleanups: list[ProductMediaStorageCleanup] = []
    for storage_model, delete_from_storage in (
        (File, delete_file_from_storage),
        (Image, delete_image_from_storage),
    ):
        result = await db.execute(
            select(storage_model).where(
                storage_model.parent_id.in_(select(subtree.c.id)),
                storage_model.parent_type == MediaParentType.PRODUCT,
            )
        )
        for item in result.scalars().all():
            cleanups.append((item, delete_from_storage))
            await db.delete(item)
    return cleanups


async def cleanup_product_media_storage(cleanups: list[ProductMediaStorageCleanup]) -> None:
    """Best-effort cleanup of storage bytes after product media DB rows have committed."""
    for item, delete_from_storage in cleanups:
        try:
            await delete_from_storage(item)
        except OSError:
            logger.warning("Product media storage cleanup failed after product deletion.", exc_info=True)
