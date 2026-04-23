"""Service for recomputing user statistics."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import UUID4
from sqlalchemy import func, select

from app.api.auth.models import User
from app.api.background_data.models import ProductType
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def recompute_user_stats(session: AsyncSession, user_id: UUID4) -> dict[str, Any]:
    """Recompute statistics for a given user and update their stats_cache.

    Stats included:
    - product_count: Total number of products owned.
    - total_weight_kg: Sum of product weights in kilograms.
    - image_count: Total images uploaded for all products.
    - top_category: Most frequent product type name.
    """
    # 1. Product count and weight
    # We use coalesce(sum(...), 0) to handle users with no products
    stmt = select(
        func.count(Product.id).label("product_count"), func.sum(Product.weight_g).label("total_weight_g")
    ).where(Product.owner_id == user_id)

    res = await session.execute(stmt)
    row = res.fetchone()
    product_count = row.product_count if row else 0
    total_weight_kg = (row.total_weight_g / 1000.0) if row and row.total_weight_g else 0.0

    # 2. Image count
    # Join with Product to only count images for products owned by this user
    image_stmt = (
        select(func.count(Image.id))
        .join(Product, (Product.id == Image.parent_id) & (Image.parent_type == MediaParentType.PRODUCT))
        .where(Product.owner_id == user_id)
    )

    image_res = await session.execute(image_stmt)
    image_count = image_res.scalar_one_or_none() or 0

    # 3. Top category
    # Find most frequent product_type_id among user's products
    top_cat_stmt = (
        select(ProductType.name)
        .join(Product, Product.product_type_id == ProductType.id)
        .where(Product.owner_id == user_id)
        .group_by(ProductType.name)
        .order_by(func.count(Product.id).desc())
        .limit(1)
    )
    top_cat_res = await session.execute(top_cat_stmt)
    top_category = top_cat_res.scalar_one_or_none() or "None"

    # Assemble stats
    stats = {
        "product_count": product_count,
        "total_weight_kg": round(total_weight_kg, 2),
        "image_count": image_count,
        "top_category": top_category,
    }

    # Update user record
    update_stmt = select(User).where(User.id == user_id)
    user_res = await session.execute(update_stmt)
    user = user_res.unique().scalar_one_or_none()
    if user:
        user.stats_cache = stats
        session.add(user)
        # Note: Caller is responsible for committing/flushing

    return stats
