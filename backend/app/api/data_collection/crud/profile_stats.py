"""Profile-stat snapshot computation for product owners."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import func, select

from app.api.auth.models import User
from app.api.auth.profile_stats import ProfileStatsData, dump_profile_stats
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType
from app.api.reference_data.models import ProductType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def recompute_user_profile_stats(session: AsyncSession, user_id: UUID4) -> ProfileStatsData:
    """Recompute one user's persisted profile-stat snapshot from source tables."""
    stmt = select(
        func.count(Product.id).label("product_count"),
        func.sum(Product.weight_g).label("total_weight_g"),
    ).where(Product.owner_id == user_id, Product.parent_id.is_(None))

    row = (await session.execute(stmt)).fetchone()
    product_count = int(row.product_count) if row and row.product_count else 0
    total_weight_g = round(row.total_weight_g or 0) if row else 0

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
        user.profile_stats = dump_profile_stats(stats)
        user.profile_stats_computed_at = datetime.now(UTC)
        session.add(user)

    return stats
