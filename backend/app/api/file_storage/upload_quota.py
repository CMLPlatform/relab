"""Postgres-backed upload quota ledger helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import and_, func, select, update

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.upload_security import UploadQuotaSnapshot, enforce_upload_quota
from app.core.config import settings

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


def _max_upload_bytes() -> int:
    """Return the configured upload quota in bytes."""
    return settings.max_upload_bytes_per_user_mb * 1024 * 1024


async def reserve_product_upload_quota(
    session: AsyncSession,
    *,
    user_id: UUID,
    upload_size_bytes: int,
    max_files: int | None = None,
    max_total_bytes: int | None = None,
) -> None:
    """Atomically reserve one product-owned upload against a user's quota ledger."""
    file_limit = max_files if max_files is not None else settings.max_upload_files_per_user
    byte_limit = max_total_bytes if max_total_bytes is not None else _max_upload_bytes()
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

    user = await session.get(User, user_id)
    if user is None:
        return
    enforce_upload_quota(
        UploadQuotaSnapshot(
            file_count=user.upload_file_count,
            total_bytes=user.upload_total_bytes,
        ),
        upload_size_bytes=upload_size_bytes,
        max_files=file_limit,
        max_total_bytes=byte_limit,
    )


async def release_product_upload_quota(
    session: AsyncSession,
    *,
    user_id: UUID,
    upload_size_bytes: int,
) -> None:
    """Release one deleted product-owned upload from a user's quota ledger."""
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(
            upload_file_count=func.greatest(User.upload_file_count - 1, 0),
            upload_total_bytes=func.greatest(User.upload_total_bytes - upload_size_bytes, 0),
        )
    )
    await session.execute(stmt)


async def recompute_user_upload_quota(session: AsyncSession, *, user_id: UUID) -> UploadQuotaSnapshot:
    """Rebuild one user's upload quota ledger from product-owned media rows."""
    totals = UploadQuotaSnapshot(file_count=0, total_bytes=0)
    for model in (File, Image):
        result = await session.execute(
            select(
                func.count(model.id),
                func.coalesce(func.sum(model.upload_size_bytes), 0),
            )
            .join(
                Product,
                and_(
                    model.parent_type == MediaParentType.PRODUCT,
                    model.parent_id == Product.id,
                ),
            )
            .where(Product.owner_id == user_id)
        )
        file_count, total_bytes = result.one()
        totals = UploadQuotaSnapshot(
            file_count=totals.file_count + int(file_count or 0),
            total_bytes=totals.total_bytes + int(total_bytes or 0),
        )

    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            upload_file_count=totals.file_count,
            upload_total_bytes=totals.total_bytes,
        )
    )
    return totals
