"""Tests for profile-stats updates in product media mutation routes."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.routers.product_mutation_routers import delete_product_image, upload_product_image
from tests.factories.models import ProductFactory, UserFactory


async def test_upload_product_image_updates_profile_stats() -> None:
    """Uploading an image should update the product owner's profile stats snapshot.

    The uploader may be a superuser acting on someone else's product, so the recompute
    must target the product's owner_id, not the uploader's id.
    """
    session = AsyncMock(spec=AsyncSession)
    uploader = UserFactory.build(id=uuid4())
    owner_id = uuid4()
    product = ProductFactory.build(id=1)
    product.owner_id = owner_id
    session.get.return_value = product
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

    db_product = MagicMock()
    db_product.id = 1

    with (
        patch("app.api.data_collection.routers.media_handlers._product_image_create", return_value=object()),
        patch(
            "app.api.data_collection.routers.media_handlers.create_parent_media",
            AsyncMock(return_value=image),
        ),
        patch(
            "app.api.data_collection.routers.media_handlers.recompute_user_profile_stats",
            AsyncMock(),
        ) as refresh_stats,
    ):
        await upload_product_image(session, db_product, MagicMock(), uploader)

    session.commit.assert_awaited_once()
    refresh_stats.assert_awaited_once_with(session, owner_id)


async def test_delete_product_image_updates_profile_stats() -> None:
    """Deleting an image should update the owner's profile stats snapshot."""
    session = AsyncMock(spec=AsyncSession)
    owner_id = uuid4()
    product = ProductFactory.build(id=1)
    product.owner_id = owner_id
    session.get.return_value = product

    db_product = MagicMock()
    db_product.id = 1

    with (
        patch("app.api.data_collection.routers.media_handlers.delete_parent_media", AsyncMock()),
        patch(
            "app.api.data_collection.routers.media_handlers.recompute_user_profile_stats",
            AsyncMock(),
        ) as refresh_stats,
    ):
        await delete_product_image(db_product, uuid4(), session)

    session.commit.assert_awaited_once()
    refresh_stats.assert_awaited_once_with(session, product.owner_id)
