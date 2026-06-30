"""SQLAlchemy aggregate queries for the system-wide stats endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image, MediaParentType
from app.api.reference_data.models import ProductType
from app.api.stats.helpers import format_period
from app.api.stats.schemas import CategoryStat, SeriesPoint, Totals

if TYPE_CHECKING:
    from datetime import date

    from sqlalchemy.ext.asyncio import AsyncSession


async def compute_totals(session: AsyncSession) -> tuple[Totals, datetime]:
    """Return all-time scalar aggregates and the computation timestamp."""
    product_stmt = select(
        func.count(Product.id).filter(Product.parent_id.is_(None)).label("teardowns"),
        func.count(Product.id).filter(Product.parent_id.isnot(None)).label("parts"),
        func.coalesce(
            func.sum(Product.weight_g).filter(Product.parent_id.is_(None)), 0
        ).label("total_weight_g"),
    )
    image_stmt = select(func.count(Image.id)).where(
        Image.parent_type == MediaParentType.PRODUCT
    )
    user_stmt = select(func.count(User.id))

    product_row = (await session.execute(product_stmt)).fetchone()
    image_count = int((await session.execute(image_stmt)).scalar_one())
    user_count = int((await session.execute(user_stmt)).scalar_one())

    return (
        Totals(
            teardowns=int(product_row.teardowns),
            parts=int(product_row.parts),
            mass_kg=round(float(product_row.total_weight_g or 0) / 1000.0, 2),
            images=image_count,
            users=user_count,
        ),
        datetime.now(UTC),
    )


async def compute_categories(
    session: AsyncSession, limit: int
) -> tuple[list[CategoryStat], datetime]:
    """Return non-zero categories ordered by teardowns DESC, capped at limit."""
    stmt = (
        select(
            ProductType.name,
            func.count(Product.id).filter(Product.parent_id.is_(None)).label("teardowns"),
            func.count(Product.id).filter(Product.parent_id.isnot(None)).label("parts"),
        )
        .join(Product, Product.product_type_id == ProductType.id)
        .group_by(ProductType.name)
        .having(func.count(Product.id) > 0)
        .order_by(
            func.count(Product.id).filter(Product.parent_id.is_(None)).desc(),
            ProductType.name.asc(),
        )
        .limit(limit)
    )

    rows = (await session.execute(stmt)).all()
    categories = [
        CategoryStat(name=row.name, teardowns=int(row.teardowns), parts=int(row.parts))
        for row in rows
    ]
    return categories, datetime.now(UTC)


async def compute_series(
    session: AsyncSession,
    granularity: str,
    start: date,
    end: date,
) -> tuple[list[SeriesPoint], datetime]:
    """Return time-bucketed activity series for the given date window."""
    start_dt = datetime(start.year, start.month, start.day, tzinfo=UTC)
    end_dt = datetime(end.year, end.month, end.day, tzinfo=UTC) + timedelta(days=1)

    trunc = lambda col: func.date_trunc(granularity, col)  # noqa: E731

    product_stmt = (
        select(
            trunc(Product.created_at).label("period"),
            func.count(Product.id).filter(Product.parent_id.is_(None)).label("teardowns"),
            func.count(Product.id).filter(Product.parent_id.isnot(None)).label("parts"),
            func.coalesce(
                func.sum(Product.weight_g).filter(Product.parent_id.is_(None)), 0
            ).label("total_weight_g"),
        )
        .where(Product.created_at >= start_dt, Product.created_at < end_dt)
        .group_by(trunc(Product.created_at))
    )

    image_stmt = (
        select(
            trunc(Image.created_at).label("period"),
            func.count(Image.id).label("images"),
        )
        .where(
            Image.parent_type == MediaParentType.PRODUCT,
            Image.created_at >= start_dt,
            Image.created_at < end_dt,
        )
        .group_by(trunc(Image.created_at))
    )

    new_user_stmt = (
        select(
            trunc(User.created_at).label("period"),
            func.count(User.id).label("users_new"),
        )
        .where(User.created_at >= start_dt, User.created_at < end_dt)
        .group_by(trunc(User.created_at))
    )

    active_user_stmt = (
        select(
            trunc(Product.created_at).label("period"),
            func.count(Product.owner_id.distinct()).label("users_active"),
        )
        .where(Product.created_at >= start_dt, Product.created_at < end_dt)
        .group_by(trunc(Product.created_at))
    )

    products_result = await session.execute(product_stmt)
    images_result = await session.execute(image_stmt)
    new_users_result = await session.execute(new_user_stmt)
    active_users_result = await session.execute(active_user_stmt)

    buckets: dict[str, dict[str, int | float]] = defaultdict(
        lambda: {"teardowns": 0, "parts": 0, "total_weight_g": 0, "images": 0, "users_new": 0, "users_active": 0}
    )

    for row in products_result.all():
        key = format_period(row.period, granularity)
        buckets[key]["teardowns"] = int(row.teardowns)
        buckets[key]["parts"] = int(row.parts)
        buckets[key]["total_weight_g"] = float(row.total_weight_g or 0)

    for row in images_result.all():
        key = format_period(row.period, granularity)
        buckets[key]["images"] = int(row.images)

    for row in new_users_result.all():
        key = format_period(row.period, granularity)
        buckets[key]["users_new"] = int(row.users_new)

    for row in active_users_result.all():
        key = format_period(row.period, granularity)
        buckets[key]["users_active"] = int(row.users_active)

    series = [
        SeriesPoint(
            period=k,
            teardowns=v["teardowns"],
            parts=v["parts"],
            mass_kg=round(float(v["total_weight_g"]) / 1000.0, 2),
            images=v["images"],
            users_new=v["users_new"],
            users_active=v["users_active"],
        )
        for k, v in sorted(buckets.items())
    ]
    return series, datetime.now(UTC)
