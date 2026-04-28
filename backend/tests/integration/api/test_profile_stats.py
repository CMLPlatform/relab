"""Integration tests for public profile statistics."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.auth.services.stats import recompute_user_profile_stats
from app.api.background_data.models import ProductType
from app.api.data_collection.models.product import Product

if TYPE_CHECKING:
    from httpx import AsyncClient


async def create_root_with_component(db_session: AsyncSession, user: User) -> None:
    """Create one base product and one component with separate weights."""
    product_type = ProductType(name="Profile Stats Tool", description="Profile stats test product type")
    root = Product(
        owner_id=user.id,
        name="Root product",
        product_type=product_type,
        weight_g=35_000,
    )
    component = Product(
        owner_id=user.id,
        name="Child component",
        product_type=product_type,
        parent=root,
        amount_in_parent=1,
        weight_g=37_000,
    )
    db_session.add_all([product_type, root, component])
    await db_session.flush()


async def test_recompute_user_profile_stats_counts_base_product_weight_only(
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """Profile weight should not count component rows on top of the base product."""
    await create_root_with_component(db_session, db_superuser)

    stats = await recompute_user_profile_stats(db_session, db_superuser.id)

    assert stats.product_count == 1
    assert stats.total_weight_g == 35_000


@pytest.mark.usefixtures("db_session")
async def test_public_profile_returns_latest_snapshot_without_external_cache(
    db_session: AsyncSession,
    api_client: AsyncClient,
    db_superuser: User,
) -> None:
    """Profile reads should return the latest persisted snapshot without Redis invalidation."""
    db_superuser.profile_stats = {
        "product_count": 1,
        "total_weight_g": 35_000,
        "image_count": 0,
        "top_category": "Profile Stats Tool",
    }
    db_superuser.profile_stats_computed_at = datetime.now(UTC)
    await db_session.flush()

    response = await api_client.get(f"/users/{db_superuser.username}/profile")
    assert response.status_code == 200
    assert response.json()["total_weight_kg"] == 35.0

    db_superuser.profile_stats = {
        "product_count": 1,
        "total_weight_g": 72_000,
        "image_count": 0,
        "top_category": "Profile Stats Tool",
    }
    db_superuser.profile_stats_computed_at = datetime.now(UTC)
    await db_session.flush()

    fresh_response = await api_client.get(f"/users/{db_superuser.id}/profile")
    assert fresh_response.status_code == 200
    assert fresh_response.json()["total_weight_kg"] == 72.0
