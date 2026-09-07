"""Integration tests for the time-series aggregate SQL.

Exercises `compute_series` against a real database. The unit router tests mock
it out, so nothing previously executed this SQL: every statement groups by a
`date_trunc(...)` expression, and Postgres rejects the GROUP BY unless the
grouped expression is identical to the selected one, bind parameter included.
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType
from app.api.stats.queries import compute_series

if TYPE_CHECKING:
    from httpx import AsyncClient

_JAN = datetime(2026, 1, 15, 12, 0, tzinfo=UTC)
_FEB = datetime(2026, 2, 20, 12, 0, tzinfo=UTC)


async def seed_two_months(db_session: AsyncSession, user: User) -> None:
    """One teardown with a component in January, one teardown in February."""
    product_type = ProductType(name="Series Test Kettle", description="Series test product type")
    jan_root = Product(
        owner_id=user.id,
        name="Kettle A",
        product_type=product_type,
        weight_g=1_500,
        created_at=_JAN,
    )
    jan_part = Product(
        owner_id=user.id,
        name="Heating element",
        product_type=product_type,
        parent=jan_root,
        amount_in_parent=1,
        weight_g=200,
        created_at=_JAN,
    )
    feb_root = Product(
        owner_id=user.id,
        name="Kettle B",
        product_type=product_type,
        weight_g=2_500,
        created_at=_FEB,
    )
    db_session.add_all([product_type, jan_root, jan_part, feb_root])
    await db_session.flush()


async def test_monthly_series_buckets_by_month(db_session: AsyncSession, db_superuser: User) -> None:
    """The query runs and buckets products into the month they were created."""
    await seed_two_months(db_session, db_superuser)

    series, _ = await compute_series(db_session, "month", _JAN.date(), _FEB.date())

    by_period = {point.period: point for point in series}
    assert set(by_period) == {"2026-01", "2026-02"}

    # January: one top-level product, one component; only the root's mass counts.
    assert by_period["2026-01"].teardowns == 1
    assert by_period["2026-01"].parts == 1
    assert by_period["2026-01"].mass_kg == 1.5

    assert by_period["2026-02"].teardowns == 1
    assert by_period["2026-02"].parts == 0
    assert by_period["2026-02"].mass_kg == 2.5


@pytest.mark.parametrize("granularity", ["day", "week", "month", "year"])
async def test_every_granularity_executes(
    db_session: AsyncSession,
    db_superuser: User,
    granularity: str,
) -> None:
    """date_trunc runs for each supported field, not just the default month."""
    await seed_two_months(db_session, db_superuser)

    series, _ = await compute_series(db_session, granularity, _JAN.date(), _FEB.date())

    assert sum(point.teardowns for point in series) == 2


async def test_periods_with_no_activity_are_omitted(db_session: AsyncSession, db_superuser: User) -> None:
    """A quiet month yields no row at all, which is why clients must zero-fill."""
    await seed_two_months(db_session, db_superuser)

    # Widen the window by a month on each side; the empty months stay absent.
    start = (_JAN - timedelta(days=45)).date()
    end = (_FEB + timedelta(days=45)).date()
    series, _ = await compute_series(db_session, "month", start, end)

    assert [point.period for point in series] == ["2026-01", "2026-02"]


async def test_series_endpoint_returns_200(
    db_session: AsyncSession,
    api_client: AsyncClient,
    db_superuser: User,
) -> None:
    """The endpoint the homepage calls answers 200, not a 500 from the GROUP BY."""
    await seed_two_months(db_session, db_superuser)

    response = await api_client.get("/v1/stats/series?granularity=month&start=2026-01-01&end=2026-02-28")

    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "month"
    assert [point["period"] for point in body["series"]] == ["2026-01", "2026-02"]
