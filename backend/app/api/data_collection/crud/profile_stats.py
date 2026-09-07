"""Profile-stat snapshot computation for product owners."""

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import func, select

from app.api.auth.profile_stats import ProfileStatsData, store_profile_stats
from app.api.data_collection.models.product import Product
from app.api.data_collection.queries import IS_TEARDOWN, product_category_counts_stmt
from app.api.file_storage.models import Image, MediaParentType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def compute_profile_stats(session: AsyncSession, user_id: UUID4) -> ProfileStatsData:
    """Compute a user's profile stats from source tables. Read-only: writes nothing.

    Safe to call on a read path (or a read replica) — the caller decides whether to
    persist the result.
    """
    stmt = select(
        func.count(Product.id).label("product_count"),
        func.sum(Product.weight_g).label("total_weight_g"),
    ).where(Product.owner_id == user_id, IS_TEARDOWN)

    row = (await session.execute(stmt)).fetchone()
    product_count = int(row.product_count) if row and row.product_count else 0
    total_weight_g = round(row.total_weight_g or 0) if row else 0

    image_stmt = (
        select(func.count(Image.id))
        .join(Product, (Product.id == Image.parent_id) & (Image.parent_type == MediaParentType.PRODUCT))
        .where(Product.owner_id == user_id)
    )
    image_count = int((await session.execute(image_stmt)).scalar_one_or_none() or 0)

    top_cat_stmt = product_category_counts_stmt(Product.owner_id == user_id, IS_TEARDOWN, limit=1)
    top_category = (await session.execute(top_cat_stmt)).scalars().one_or_none()

    return ProfileStatsData(
        product_count=product_count,
        total_weight_g=total_weight_g,
        image_count=image_count,
        top_category=top_category,
    )


async def recompute_user_profile_stats(session: AsyncSession, user_id: UUID4) -> ProfileStatsData:
    """Recompute one user's profile stats and stage the snapshot on the session."""
    stats = await compute_profile_stats(session, user_id)
    await store_profile_stats(session, user_id, stats)
    return stats
