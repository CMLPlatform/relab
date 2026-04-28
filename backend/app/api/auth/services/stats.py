"""Services for persisted profile-stat snapshots."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import func, select

from app.api.auth.models import User
from app.api.auth.profile_stats import ProfileStatsData, dump_profile_stats, load_profile_stats
from app.api.background_data.models import ProductType
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def _normalize_weight_g(weight_g: float | None) -> int:
    """Normalize a possibly-null product weight to a persisted integer gram value."""
    return round(weight_g or 0)


def _persist_profile_stats(
    user: User,
    stats: ProfileStatsData,
    *,
    computed_at: datetime | None = None,
) -> None:
    """Persist a typed stats snapshot back onto the user row."""
    user.profile_stats = dump_profile_stats(stats)
    if computed_at is not None:
        user.profile_stats_computed_at = computed_at


def get_profile_stats(user: User) -> ProfileStatsData:
    """Return the current typed snapshot for one user."""
    return load_profile_stats(user.profile_stats)


async def recompute_user_profile_stats(session: AsyncSession, user_id: UUID4) -> ProfileStatsData:
    """Recompute one user's persisted profile-stat snapshot from source tables."""
    stmt = select(
        func.count(Product.id).label("product_count"),
        func.sum(Product.weight_g).label("total_weight_g"),
    ).where(Product.owner_id == user_id, Product.parent_id.is_(None))

    row = (await session.execute(stmt)).fetchone()
    product_count = int(row.product_count) if row and row.product_count else 0
    total_weight_g = _normalize_weight_g(row.total_weight_g if row else None)

    image_stmt = (
        select(func.count(Image.id))
        .join(Product, (Product.id == Image.parent_id) & (Image.parent_type == MediaParentType.PRODUCT))
        .where(Product.owner_id == user_id)
    )
    image_count = int((await session.execute(image_stmt)).scalar_one_or_none() or 0)

    top_cat_stmt = (
        select(ProductType.name)
        .join(Product, Product.product_type_id == ProductType.id)
        .where(Product.owner_id == user_id, Product.parent_id.is_(None))
        .group_by(ProductType.name)
        .order_by(func.count(Product.id).desc(), ProductType.name.asc())
        .limit(1)
    )
    top_category = (await session.execute(top_cat_stmt)).scalar_one_or_none()

    stats = ProfileStatsData(
        product_count=product_count,
        total_weight_g=total_weight_g,
        image_count=image_count,
        top_category=top_category,
    )

    user = await session.get(User, user_id)
    if user is not None:
        _persist_profile_stats(
            user,
            stats,
            computed_at=datetime.now(UTC),
        )
        session.add(user)

    return stats


async def refresh_profile_stats_after_mutation(session: AsyncSession, user_id: UUID4) -> ProfileStatsData:
    """Refresh one user's profile-stat snapshot after a source-table mutation."""
    return await recompute_user_profile_stats(session, user_id)
