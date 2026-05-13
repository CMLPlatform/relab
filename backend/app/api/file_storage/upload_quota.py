"""Postgres-backed upload quota ledger helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import and_, func, select, union_all, update

from app.api.auth.models import User
from app.api.common.exceptions import PayloadTooLargeError
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import File, Image, MediaParentType
from app.core.config import settings

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from .crud.support_types import StorageModel


UPLOAD_QUOTA_EXCEEDED_MESSAGE = "Upload quota exceeded."


def _max_upload_bytes() -> int:
    """Return the configured upload quota in bytes."""
    return settings.max_upload_bytes_per_user_mb * 1024 * 1024


async def reserve_product_upload_quota(
    session: AsyncSession,
    *,
    user_id: UUID,
    upload_size_bytes: int,
) -> None:
    """Atomically reserve one product-owned upload against a user's quota ledger."""
    file_limit = settings.max_upload_files_per_user
    byte_limit = _max_upload_bytes()
    stmt = (
        update(User)
        .where(
            User.id == user_id,
            User.upload_file_count < file_limit,
            User.upload_total_bytes + upload_size_bytes <= byte_limit,
        )
        .values(
            upload_file_count=User.upload_file_count + 1,
            upload_total_bytes=User.upload_total_bytes + upload_size_bytes,
        )
        .returning(User.id)
    )
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is not None:
        return

    raise PayloadTooLargeError(UPLOAD_QUOTA_EXCEEDED_MESSAGE)


async def release_product_upload_quota_for_media(session: AsyncSession, item: StorageModel) -> None:
    """Release quota for one deleted product-owned media item."""
    if item.parent_type != MediaParentType.PRODUCT:
        return

    stmt = (
        update(User)
        .where(
            Product.id == item.parent_id,
            Product.owner_id == User.id,
        )
        .values(
            upload_file_count=func.greatest(User.upload_file_count - 1, 0),
            upload_total_bytes=func.greatest(User.upload_total_bytes - item.upload_size_bytes, 0),
        )
    )
    await session.execute(stmt)


async def recompute_user_upload_quota(session: AsyncSession, *, user_id: UUID) -> None:
    """Rebuild one user's upload quota ledger from product-owned media rows."""
    file_rows = (
        select(File.upload_size_bytes.label("upload_size_bytes"))
        .join(
            Product,
            and_(
                File.parent_type == MediaParentType.PRODUCT,
                File.parent_id == Product.id,
            ),
        )
        .where(Product.owner_id == user_id)
    )
    image_rows = (
        select(Image.upload_size_bytes.label("upload_size_bytes"))
        .join(
            Product,
            and_(
                Image.parent_type == MediaParentType.PRODUCT,
                Image.parent_id == Product.id,
            ),
        )
        .where(Product.owner_id == user_id)
    )
    product_media = union_all(file_rows, image_rows).subquery("product_media")
    upload_totals = (
        select(
            func.count().label("file_count"),
            func.coalesce(func.sum(product_media.c.upload_size_bytes), 0).label("total_bytes"),
        )
        .select_from(product_media)
        .subquery("upload_totals")
    )

    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            upload_file_count=upload_totals.c.file_count,
            upload_total_bytes=upload_totals.c.total_bytes,
        )
    )
