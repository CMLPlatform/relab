"""Postgres-backed upload quota ledger helpers.

NOTE: the quota columns live on ``User`` (auth) while the chargeable parent is a
``Product`` (data_collection), so this module is an accepted cross-context
exception: every statement here is a single UPDATE joining both tables, which no
model registry can express without giving up type safety on the columns.
"""

from typing import TYPE_CHECKING

from sqlalchemy import Case, and_, case, func, select, union_all, update

from app.api.auth.models import User
from app.api.auth.roles import UserRole, upload_quota_bytes_for_role, upload_quota_files_for_role
from app.api.common.exceptions import PayloadTooLargeError
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import File, Image, MediaParentType

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from .crud.support_types import StorageModel


UPLOAD_QUOTA_EXCEEDED_MESSAGE = "Upload quota exceeded."


def _quota_by_role(quota_for_role: Callable[[UserRole], int]) -> Case[int]:
    """Return a CASE mapping the charged user's role to their quota.

    Keeps the reservation a single atomic UPDATE: the limit varies per row, so it
    has to be resolved in SQL rather than read into Python and compared there,
    which would reintroduce the read-then-write race the UPDATE exists to avoid.
    """
    return case(
        *((User.role == role.value, quota_for_role(role)) for role in UserRole),
        else_=quota_for_role(UserRole.CONTRIBUTOR),
    )


async def reserve_product_upload_quota(
    session: AsyncSession,
    *,
    parent_id: int,
    upload_size_bytes: int,
) -> None:
    """Atomically reserve one product-owned upload against the owner's quota ledger.

    Charges the product's ``owner_id`` (not the requesting user), so it stays
    consistent with release/recompute — a superuser uploading to another user's
    product charges that product's owner, not themselves. The limits follow that
    same owner's role, for the same reason.
    """
    file_limit = _quota_by_role(upload_quota_files_for_role)
    byte_limit = _quota_by_role(upload_quota_bytes_for_role)
    owner_id = select(Product.owner_id).where(Product.id == parent_id).scalar_subquery()
    stmt = (
        update(User)
        .where(
            User.id == owner_id,
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

    # Two scalar subqueries, so Postgres scans the media rows once per column. An
    # UPDATE ... FROM would do it in one pass, but the aggregate has no join
    # condition to the user row — it is already scoped by user_id inside — so
    # SQLAlchemy flags it as a cartesian product on every recompute. Not worth a
    # warning in the logs of a repair path that runs by hand.
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            upload_file_count=select(upload_totals.c.file_count).scalar_subquery(),
            upload_total_bytes=select(upload_totals.c.total_bytes).scalar_subquery(),
        )
    )
