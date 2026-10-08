"""Product storage helpers for cascade deletion."""

import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from sqlalchemy import delete, select

from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.file_storage.crud.support_paths import delete_file_from_storage, delete_image_from_storage
from app.api.file_storage.models import File, Image, MediaParentType, Video

if TYPE_CHECKING:
    from sqlalchemy import ColumnElement, Select
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

type ProductMediaStorageDelete = Callable[[File | Image], Awaitable[None]]
type ProductMediaStorageCleanup = tuple[File | Image, ProductMediaStorageDelete]


async def _delete_media_from_storage(item: File | Image) -> None:
    if isinstance(item, Image):
        await delete_image_from_storage(item)
    else:
        await delete_file_from_storage(item)


def product_subtree_ids(*root_criteria: ColumnElement[bool]) -> Select[tuple[int]]:
    """Select the ids of the products matching ``root_criteria`` and every component below them."""
    subtree = select(Product.id).where(*root_criteria).cte("product_subtree", recursive=True)
    subtree = subtree.union_all(select(Product.id).where(Product.parent_id == subtree.c.id))
    return select(subtree.c.id)


async def delete_product_media(db: AsyncSession, product_ids: Select[tuple[int]]) -> list[ProductMediaStorageCleanup]:
    """Stage media rows of ``product_ids`` for deletion and return post-commit storage cleanup targets.

    Pass the whole subtree (``product_subtree_ids``): components are deleted with the
    product, so their media bytes must be staged for cleanup too, not just the root's.
    """
    cleanups: list[ProductMediaStorageCleanup] = []
    for storage_model in (File, Image):
        result = await db.execute(
            select(storage_model).where(
                storage_model.parent_id.in_(product_ids),
                storage_model.parent_type == MediaParentType.PRODUCT,
            )
        )
        for item in result.scalars().all():
            cleanups.append((item, _delete_media_from_storage))
            await db.delete(item)
    return cleanups


async def delete_product_rows(db: AsyncSession, product_ids: Select[tuple[int]]) -> None:
    """Delete ``product_ids`` with their bill-of-materials and video rows, one statement per table.

    ``product_ids`` must be closed under ``parent_id`` (a whole subtree): the parent
    foreign key is checked when the statement ends, so parents and components can go
    in the same statement, but a component left behind would fail it. Media rows are
    not covered; stage them first with ``delete_product_media``.
    """
    await db.execute(delete(MaterialProductLink).where(MaterialProductLink.product_id.in_(product_ids)))
    await db.execute(delete(Video).where(Video.product_id.in_(product_ids)))
    await db.execute(delete(Product).where(Product.id.in_(product_ids)))


async def cleanup_product_media_storage(cleanups: list[ProductMediaStorageCleanup]) -> None:
    """Best-effort cleanup of storage bytes after product media DB rows have committed."""
    for item, delete_from_storage in cleanups:
        try:
            await delete_from_storage(item)
        except OSError:
            logger.warning("Product media storage cleanup failed after product deletion.", exc_info=True)
