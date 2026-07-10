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
from app.api.stats.schemas import CategoryScope, CategoryStat, SeriesPoint, Totals

if TYPE_CHECKING:
    from datetime import date

    from sqlalchemy import ColumnElement
    from sqlalchemy.ext.asyncio import AsyncSession


async def compute_totals(session: AsyncSession) -> tuple[Totals, datetime]:
    """Return all-time scalar aggregates and the computation timestamp."""
    product_stmt = select(
        func.count(Product.id).filter(Product.parent_id.is_(None)).label("teardowns"),
        func.count(Product.id).filter(Product.parent_id.isnot(None)).label("parts"),
        func.coalesce(func.sum(Product.weight_g).filter(Product.parent_id.is_(None)), 0).label("total_weight_g"),
    )
    image_stmt = select(func.count(Image.id)).where(Image.parent_type == MediaParentType.PRODUCT)
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


# Each scope restricts the population before grouping. A product's category is
# its own product_type -- a component is categorised as the component it is, not
# as the product it came out of -- so the two populations never share a row.
_SCOPE_FILTERS: dict[CategoryScope, ColumnElement[bool] | None] = {
    CategoryScope.PRODUCTS: Product.parent_id.is_(None),
    CategoryScope.COMPONENTS: Product.parent_id.isnot(None),
    CategoryScope.ALL: None,
}


async def compute_categories(
    session: AsyncSession,
    limit: int,
    scope: CategoryScope,
) -> tuple[list[CategoryStat], datetime]:
    """Return categories within `scope` ordered by count DESC, capped at limit.

    The inner join means a category only appears once it has at least one
    product in the requested scope, so zero-count rows never reach the client.
    """
    count_col = func.count(Product.id).label("count")
    stmt = select(ProductType.name, count_col).join(Product, Product.product_type_id == ProductType.id)

    scope_filter = _SCOPE_FILTERS[scope]
    if scope_filter is not None:
        stmt = stmt.where(scope_filter)

    stmt = stmt.group_by(ProductType.name).order_by(count_col.desc(), ProductType.name.asc()).limit(limit)

    rows = (await session.execute(stmt)).all()
    categories = [CategoryStat(name=row.name, count=int(row.count)) for row in rows]
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

    # One expression object per statement, reused by both SELECT and GROUP BY.
    # Building it twice yields two separate bind parameters, which Postgres then
    # reads as two different expressions -- it rejects the GROUP BY and demands
    # the raw created_at column instead.
    def trunc(col: ColumnElement) -> ColumnElement:
        return func.date_trunc(granularity, col)

    product_period = trunc(Product.created_at)
    image_period = trunc(Image.created_at)
    user_period = trunc(User.created_at)
    active_user_period = trunc(Product.created_at)

    product_stmt = (
        select(
            product_period.label("period"),
            func.count(Product.id).filter(Product.parent_id.is_(None)).label("teardowns"),
            func.count(Product.id).filter(Product.parent_id.isnot(None)).label("parts"),
            func.coalesce(func.sum(Product.weight_g).filter(Product.parent_id.is_(None)), 0).label("total_weight_g"),
        )
        .where(Product.created_at >= start_dt, Product.created_at < end_dt)
        .group_by(product_period)
    )

    image_stmt = (
        select(
            image_period.label("period"),
            func.count(Image.id).label("images"),
        )
        .where(
            Image.parent_type == MediaParentType.PRODUCT,
            Image.created_at >= start_dt,
            Image.created_at < end_dt,
        )
        .group_by(image_period)
    )

    new_user_stmt = (
        select(
            user_period.label("period"),
            func.count(User.id).label("users_new"),
        )
        .where(User.created_at >= start_dt, User.created_at < end_dt)
        .group_by(user_period)
    )

    active_user_stmt = (
        select(
            active_user_period.label("period"),
            func.count(Product.owner_id.distinct()).label("users_active"),
        )
        .where(Product.created_at >= start_dt, Product.created_at < end_dt)
        .group_by(active_user_period)
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
