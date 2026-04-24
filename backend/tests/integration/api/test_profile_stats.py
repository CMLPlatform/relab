"""Integration tests for public profile statistics."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.auth.services.profile_cache import invalidate_profile_cache
from app.api.auth.services.stats import recompute_user_stats
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


async def test_recompute_user_stats_counts_base_product_weight_only(
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """Profile weight should not count component rows on top of the base product."""
    await create_root_with_component(db_session, db_superuser)

    stats = await recompute_user_stats(db_session, db_superuser.id)

    assert stats["product_count"] == 1
    assert stats["total_weight_kg"] == 35.0


async def test_public_profile_cache_uses_user_id_and_targeted_invalidation(
    db_session: AsyncSession,
    api_client: AsyncClient,
    db_superuser: User,
) -> None:
    """Username and UUID reads should share one user-id cache family."""
    await invalidate_profile_cache(db_superuser.id)
    db_superuser.stats_cache = {
        "product_count": 1,
        "total_weight_kg": 35.0,
        "image_count": 0,
        "top_category": "Profile Stats Tool",
    }
    await db_session.flush()

    response = await api_client.get(f"/users/{db_superuser.username}/profile")
    assert response.status_code == 200
    assert response.json()["total_weight_kg"] == 35.0

    db_superuser.stats_cache = {
        "product_count": 1,
        "total_weight_kg": 72.0,
        "image_count": 0,
        "top_category": "Profile Stats Tool",
    }
    await db_session.flush()

    cached_response = await api_client.get(f"/users/{db_superuser.id}/profile")
    assert cached_response.status_code == 200
    assert cached_response.json()["total_weight_kg"] == 35.0

    await invalidate_profile_cache(db_superuser.id)
    fresh_response = await api_client.get(f"/users/{db_superuser.id}/profile")
    assert fresh_response.status_code == 200
    assert fresh_response.json()["total_weight_kg"] == 72.0
