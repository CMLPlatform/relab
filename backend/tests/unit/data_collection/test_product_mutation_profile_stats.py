"""Tests for profile-stats updates in product media mutation routes."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.routers.product_mutation_routers import delete_product_image, upload_product_image
from tests.factories.models import ProductFactory, UserFactory


async def test_upload_product_image_updates_profile_stats() -> None:
    """Uploading an image should update the owner's profile stats snapshot."""
    session = AsyncMock(spec=AsyncSession)
    user = UserFactory.build(id=uuid4())
    image = SimpleNamespace(
        id=uuid4(),
        filename="image.png",
        description=None,
        image_metadata=None,
        created_at=None,
        updated_at=None,
        image_url="/uploads/images/image.png",
        thumbnail_url=None,
    )

    with (
        patch("app.api.data_collection.routers.media_handlers._product_image_create", return_value=object()),
        patch(
            "app.api.data_collection.routers.media_handlers.create_product_image",
            AsyncMock(return_value=image),
        ),
        patch(
            "app.api.data_collection.routers.media_handlers.refresh_profile_stats_after_mutation",
            AsyncMock(),
        ) as refresh_stats,
    ):
        await upload_product_image(session, 1, MagicMock(), user)

    session.commit.assert_awaited_once()
    refresh_stats.assert_awaited_once_with(session, user.id)


async def test_delete_product_image_updates_profile_stats() -> None:
    """Deleting an image should update the owner's profile stats snapshot."""
    session = AsyncMock(spec=AsyncSession)
    owner_id = uuid4()
    product = ProductFactory.build(id=1)
    product.owner_id = owner_id
    session.get.return_value = product

    with (
        patch("app.api.data_collection.routers.media_handlers.delete_product_image", AsyncMock()),
        patch(
            "app.api.data_collection.routers.media_handlers.refresh_profile_stats_after_mutation",
            AsyncMock(),
        ) as refresh_stats,
    ):
        await delete_product_image(1, uuid4(), session)

    session.commit.assert_awaited_once()
    refresh_stats.assert_awaited_once_with(session, product.owner_id)
