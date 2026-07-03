"""Unit tests for data collection CRUD operations."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.common.models.enums import Unit
from app.api.data_collection.crud.material_links import (
    add_material_to_product,
    remove_materials_from_product,
)
from app.api.data_collection.crud.product_commands import (
    create_product,
    delete_product,
    delete_product_media,
)
from app.api.data_collection.exceptions import (
    MaterialIDRequiredError,
    ProductOwnerRequiredError,
)
from app.api.data_collection.schemas import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    ProductCreateWithComponents,
)
from tests.factories.models import ProductFactory


async def test_delete_product_commits_db_changes_before_storage_cleanup(mock_session: AsyncMock) -> None:
    """Product delete should commit DB rows atomically before deleting stored bytes."""
    product_id = 1
    db_product = ProductFactory.build(id=product_id)
    db_product.owner_id = uuid4()
    events: list[str] = []

    async def commit() -> None:
        events.append("commit")

    async def flush() -> None:
        events.append("flush")

    async def recompute_quota(*_args: object, **_kwargs: object) -> None:
        events.append("quota")

    async def refresh_stats(*_args: object, **_kwargs: object) -> None:
        events.append("stats")

    async def delete_from_storage(file_path: Path) -> None:
        events.append(f"cleanup:{file_path.name}")

    mock_session.flush.side_effect = flush
    mock_session.commit.side_effect = commit

    with (
        patch("app.api.data_collection.crud.product_commands.require_locked_model", return_value=db_product),
        patch(
            "app.api.data_collection.crud.product_commands.delete_product_media",
            return_value=[(Path("relab-file.txt"), delete_from_storage)],
        ),
        patch(
            "app.api.data_collection.crud.product_commands.recompute_user_profile_stats",
            AsyncMock(side_effect=refresh_stats),
        ),
        patch(
            "app.api.data_collection.crud.product_commands.recompute_user_upload_quota",
            AsyncMock(side_effect=recompute_quota),
        ),
        patch("app.api.data_collection.crud.product_commands.audit_event"),
    ):
        await delete_product(mock_session, product_id)

    assert mock_session.commit.call_count == 1
    assert events == ["flush", "quota", "stats", "commit", "cleanup:relab-file.txt"]


async def test_delete_product_storage_cleanup_failure_does_not_raise(mock_session: AsyncMock) -> None:
    """Post-commit storage cleanup is best-effort after canonical DB state is gone."""
    product_id = 1
    db_product = ProductFactory.build(id=product_id)
    db_product.owner_id = uuid4()

    async def delete_from_storage(_file_path: Path) -> None:
        msg = "storage unavailable"
        raise OSError(msg)

    with (
        patch("app.api.data_collection.crud.product_commands.require_locked_model", return_value=db_product),
        patch(
            "app.api.data_collection.crud.product_commands.delete_product_media",
            return_value=[(Path("relab-file.txt"), delete_from_storage)],
        ),
        patch(
            "app.api.data_collection.crud.product_commands.recompute_user_profile_stats",
            AsyncMock(),
        ),
        patch(
            "app.api.data_collection.crud.product_commands.recompute_user_upload_quota",
            AsyncMock(),
        ),
        patch("app.api.data_collection.crud.product_commands.audit_event"),
    ):
        await delete_product(mock_session, product_id)

    mock_session.flush.assert_awaited_once()
    assert mock_session.commit.call_count == 1


async def test_delete_product_media_stages_rows_without_committing(mock_session: AsyncMock) -> None:
    """Product media deletion stages DB rows and returns storage cleanup work."""
    file_item = MagicMock()
    file_item.file.path = "relab-file.txt"
    image_item = MagicMock()
    image_item.file.path = "relab-image.png"

    file_result = MagicMock()
    file_result.scalars.return_value.all.return_value = [file_item]
    image_result = MagicMock()
    image_result.scalars.return_value.all.return_value = [image_item]
    mock_session.execute.side_effect = [file_result, image_result]

    cleanups = await delete_product_media(mock_session, product_id=1)

    assert mock_session.delete.await_count == 2
    mock_session.commit.assert_not_called()
    assert [file_path.name for file_path, _delete_from_storage in cleanups] == ["relab-file.txt", "relab-image.png"]


async def test_create_product_tree_requires_owner(mock_session: AsyncMock) -> None:
    """The shared tree helper should reject creation attempts without an owner id."""
    product_create = ProductCreateWithComponents(
        name="Makita DHP486 Combi Drill",
        bill_of_materials=[MaterialProductLinkCreateWithinProduct(material_id=1, quantity=1.0, unit=Unit.KILOGRAM)],
    )

    with pytest.raises(ProductOwnerRequiredError, match="owner_id must be set"):
        await create_product(mock_session, product_create, owner_id=None)


async def test_add_material_missing_id(mock_session: AsyncMock) -> None:
    """Test error when material ID is missing."""
    link_create = MaterialProductLinkCreateWithinProductAndMaterial(quantity=5.0)

    with pytest.raises(MaterialIDRequiredError, match="Material ID is required"):
        await add_material_to_product(mock_session, product_id=1, material_link=link_create, material_id=None)


async def test_remove_materials_from_product(mock_session: AsyncMock) -> None:
    """Test removal of materials from product."""
    product_id = 1
    material_ids = {10, 20}

    db_product = ProductFactory.build(id=product_id)
    link1 = MagicMock(material_id=10, id=10)
    link2 = MagicMock(material_id=20, id=20)
    object.__setattr__(db_product, "bill_of_materials", [link1, link2])

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [link1, link2]
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute = AsyncMock(return_value=mock_result)

    with (
        patch("app.api.data_collection.crud.material_links.require_model", return_value=db_product),
        patch("app.api.data_collection.crud.material_links.require_models"),
    ):
        await remove_materials_from_product(mock_session, product_id, material_ids)
        # One execute for the bulk DELETE; no individual db.delete calls
        mock_session.execute.assert_called_once()
        assert mock_session.delete.call_count == 0
        mock_session.commit.assert_called_once()
