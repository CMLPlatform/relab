"""Behavior-focused tests for parent-scoped media CRUD."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile

from app.api.common.exceptions import BadRequestError
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud.parent_media import ParentMediaCrud
from app.api.file_storage.exceptions import ParentStorageOwnershipError
from app.api.file_storage.models import Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateInternal
from app.api.reference_data.models import Material

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
CONTENT_TYPE_PNG = "image/png"


class TestParentStorageCrud:
    """Test parent-scoped storage operations."""

    async def test_create_rejects_parent_scope_mismatch(self, mock_session: AsyncMock) -> None:
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

    async def test_delete_removes_db_record_when_storage_file_is_missing(self, mock_session: AsyncMock) -> None:
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

    async def test_get_by_id_raises_not_found_for_wrong_parent(self, mock_session: AsyncMock) -> None:
        """Test a not found error is raised if the item exists but is not owned by the specified parent."""
        operations = ParentMediaCrud(
            parent_model=Product,
            parent_type=MediaParentType.PRODUCT,
            storage_model=Image,
            storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
        )

        item_id = uuid4()

        with (
            patch(
                "app.api.file_storage.crud.parent_media.get_parent_owned_storage_item",
                new=AsyncMock(side_effect=ParentStorageOwnershipError(Image, item_id, Product, 1)),
            ),
            pytest.raises(ParentStorageOwnershipError, match="not found for"),
        ):
            await operations.get_by_id(mock_session, 1, item_id)

    async def test_get_by_id_uses_configured_parent_type(self, mock_session: AsyncMock) -> None:
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
