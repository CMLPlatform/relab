"""Behavior-focused tests for parent-scoped media CRUD."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.exceptions import BadRequestError
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.parent_media import ParentMediaCrud, unlink_stored_media
from app.api.file_storage.exceptions import StorageBackendError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateInternal
from app.api.reference_data.models import Material

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
CONTENT_TYPE_PNG = "image/png"


async def test_create_rejects_parent_scope_mismatch(mock_session: AsyncMock) -> None:
    """Test that creating an item with a parent ID that doesn't match the expected parent scope raises an error."""
    operations = ParentMediaCrud(
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
    )

    image_create = ImageCreateInternal(
        file=MagicMock(spec=UploadFile, filename=TEST_FILENAME, size=1024, content_type=CONTENT_TYPE_PNG),
        description=TEST_FILE_DESC,
        parent_id=2,
        parent_type=MediaParentType.MATERIAL,
    )

    with pytest.raises(BadRequestError, match="Parent ID mismatch"):
        await operations.create(mock_session, 1, image_create)


async def test_delete_removes_db_record_when_storage_file_is_missing(mock_session: AsyncMock) -> None:
    """Test that deleting an item removes the database record even if the storage file is missing."""
    storage_service = MagicMock()
    storage_service.delete = AsyncMock()
    operations = ParentMediaCrud(
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        storage_service=storage_service,
    )

    item_id = uuid4()
    db_item = MagicMock(spec=Image)
    db_item.parent_id = 1

    with patch(
        "app.api.file_storage.crud.parent_media.get_parent_owned_storage_item",
        new=AsyncMock(return_value=db_item),
    ):
        await operations.delete(mock_session, 1, item_id)

    storage_service.delete.assert_awaited_once_with(mock_session, item_id)


async def test_get_by_id_raises_not_found_for_wrong_parent(mock_session: AsyncMock) -> None:
    """Test a not found error is raised if the item exists but is not owned by the specified parent."""
    operations = ParentMediaCrud(
        parent_model=Product,
        parent_type=MediaParentType.PRODUCT,
        storage_model=Image,
        storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
    )

    item_id = uuid4()

    # An item owned by a different parent simply does not match the scoped query, so
    # the real lookup sees no row. Drive that through the actual code rather than
    # injecting an exception, which would only assert that mocks re-raise.
    # Result is a sync MagicMock: only `execute` itself is awaited.
    result = MagicMock()
    result.scalars.return_value.unique.return_value.one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=result)

    with (
        patch("app.api.file_storage.crud.support_services.require_model", new=AsyncMock()),
        pytest.raises(ModelNotFoundError, match="not found"),
    ):
        await operations.get_by_id(mock_session, 1, item_id)


async def test_get_by_id_uses_configured_parent_type(mock_session: AsyncMock) -> None:
    """Parent-scoped lookup should use the CRUD object's parent type."""
    operations = ParentMediaCrud(
        parent_model=Material,
        parent_type=MediaParentType.MATERIAL,
        storage_model=Image,
        storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
    )
    item_id = uuid4()
    db_item = MagicMock(spec=Image)

    with (
        patch(
            "app.api.file_storage.crud.parent_media.get_parent_owned_storage_item",
            new=AsyncMock(return_value=db_item),
        ) as get_scoped_item,
        patch("app.api.file_storage.crud.parent_media.storage_item_exists", return_value=True),
    ):
        await operations.get_by_id(mock_session, 1, item_id)

    get_scoped_item.assert_awaited_once_with(
        mock_session,
        parent_model=Material,
        model=Image,
        parent_id=1,
        item_id=item_id,
        parent_type=MediaParentType.MATERIAL,
    )


async def test_unlink_stored_media_survives_storage_backend_error_and_continues() -> None:
    """A backend delete failure for one item is logged and skipped, not raised.

    Regression coverage for the botocore-shaped failure mode: ``StorageBackendError``
    (raised by S3Storage.delete, not a plain OSError from a local unlink) must still be
    tolerated here, since the parent row is already committed gone by the time this runs.
    """
    failing_file = MagicMock(spec=File)
    ok_image = MagicMock(spec=Image)

    with (
        patch(
            "app.api.file_storage.crud.parent_media.delete_file_from_storage",
            new=AsyncMock(side_effect=StorageBackendError("throttled")),
        ),
        patch("app.api.file_storage.crud.parent_media.delete_image_from_storage", new=AsyncMock()) as mock_delete_image,
    ):
        await unlink_stored_media([failing_file, ok_image])

    mock_delete_image.assert_awaited_once_with(ok_image)
