"""Behavior-focused tests for file and image CRUD entrypoints."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile

from app.api.file_storage.crud.media_queries import create_file, create_image, delete_file, delete_image
from app.api.file_storage.exceptions import ModelFileNotFoundError, UploadTooLargeError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateInternal
from tests.factories.models import ProductFactory

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
TEST_IMAGE_DESC = "Test image"
IMAGE_FILENAME = "image.png"
FAKE_PATH = "/fake/path/test.txt"
FAKE_IMAGE_PATH = "/fake/path/test.png"
CONTENT_TYPE_PNG = "image/png"
MB = 1024 * 1024


class TestFileStorageCrud:
    """Test CRUD operations for generic files."""

    async def test_create_file_success(self, mock_session: AsyncMock) -> None:
        """Creates a file record for a valid upload."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = TEST_FILENAME
        mock_file.size = 1024
        mock_file.file = BytesIO(b"test content")

        file_create = FileCreate(
            file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with (
            patch("app.api.file_storage.crud.support_queries.parent_model_for_type") as mock_parent_model,
            patch("app.api.file_storage.crud.support_queries.require_model"),
            patch("app.api.file_storage.crud.support_services._get_file_storage") as mock_get_storage,
        ):
            mock_parent_model.return_value = MagicMock()
            mock_storage = mock_get_storage.return_value
            mock_storage.write_upload = AsyncMock(return_value="stored_test.txt")

            result = await create_file(mock_session, file_create)

        assert isinstance(result, File)
        assert result.description == TEST_FILE_DESC
        assert result.filename == TEST_FILENAME
        assert result.parent_type == MediaParentType.PRODUCT
        assert result.parent_id == 1

    async def test_create_file_rejects_oversized_upload(self, mock_session: AsyncMock) -> None:
        """Rejects file uploads above the size limit."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = TEST_FILENAME
        mock_file.size = 51 * MB
        mock_file.file = BytesIO(b"")

        file_create = FileCreate(
            file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with pytest.raises(UploadTooLargeError, match="Maximum size: 50 MB"):
            await create_file(mock_session, file_create)

    async def test_delete_file_success(self, mock_session: AsyncMock) -> None:
        """Deletes a stored file and its database record."""
        file_id = uuid4()
        mock_db_file = MagicMock(spec=File)
        mock_db_file.file.path = FAKE_PATH

        with (
            patch("app.api.file_storage.crud.support_services.require_model", return_value=mock_db_file),
            patch("app.api.file_storage.crud.support_services.delete_file_from_storage") as mock_delete_from_storage,
        ):
            await delete_file(mock_session, file_id)

        mock_session.delete.assert_called_once_with(mock_db_file)
        mock_delete_from_storage.assert_called_once_with(Path(FAKE_PATH))


class TestImageStorageCrud:
    """Test CRUD operations for image files."""

    async def test_create_image_internal_success(self, mock_session: AsyncMock) -> None:
        """Creates an image record for a valid upload."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = IMAGE_FILENAME
        mock_file.content_type = CONTENT_TYPE_PNG
        mock_file.size = 1024
        mock_file.file = BytesIO(b"fake image bytes")
        mock_file.path = None

        image_create = ImageCreateInternal(
            file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with (
            patch(
                "app.api.file_storage.crud.support_queries.require_model",
                return_value=ProductFactory.build(id=1, owner_id=uuid4(), first_image_id=uuid4()),
            ),
            patch("app.api.file_storage.crud.support_services._get_image_storage") as mock_get_storage,
        ):
            mock_storage = mock_get_storage.return_value
            mock_storage.write_image_upload = AsyncMock(return_value="stored_image.png")
            result = await create_image(mock_session, image_create)

        assert isinstance(result, Image)
        assert result.description == TEST_IMAGE_DESC
        assert result.filename == IMAGE_FILENAME

    async def test_create_image_rejects_oversized_upload(self, mock_session: AsyncMock) -> None:
        """Rejects image uploads above the size limit."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = IMAGE_FILENAME
        mock_file.content_type = CONTENT_TYPE_PNG
        mock_file.size = 11 * MB
        mock_file.file = BytesIO(b"")

        image_create = ImageCreateInternal(
            file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with pytest.raises(UploadTooLargeError, match="Maximum size: 10 MB"):
            await create_image(mock_session, image_create)

    async def test_delete_image_success(self, mock_session: AsyncMock) -> None:
        """Deletes a stored image and its database record."""
        image_id = uuid4()
        mock_db_image = MagicMock(spec=Image)
        mock_db_image.file.path = FAKE_IMAGE_PATH

        with (
            patch("app.api.file_storage.crud.support_services.require_model", return_value=mock_db_image),
            patch(
                "app.api.file_storage.crud.support_services.delete_image_from_storage",
                new=AsyncMock(),
            ) as mock_delete_image,
        ):
            await delete_image(mock_session, image_id)
        mock_session.delete.assert_called_once_with(mock_db_image)
        mock_delete_image.assert_awaited_once_with(Path(FAKE_IMAGE_PATH))

    async def test_delete_image_cleans_thumbnails_when_original_is_missing(self, mock_session: AsyncMock) -> None:
        """Cleans up derived image files when the original file record is missing."""
        image_id = uuid4()
        mock_db_image = MagicMock(spec=Image)
        mock_db_image.file.path = FAKE_IMAGE_PATH
        mock_session.get.return_value = mock_db_image

        with (
            patch(
                "app.api.file_storage.crud.support_services.require_model",
                side_effect=ModelFileNotFoundError(Image, image_id),
            ),
            patch(
                "app.api.file_storage.crud.support_services.delete_image_from_storage",
                new=AsyncMock(),
            ) as mock_delete_image,
        ):
            await delete_image(mock_session, image_id)

        mock_session.delete.assert_called_once_with(mock_db_image)
        mock_delete_image.assert_awaited_once_with(Path(FAKE_IMAGE_PATH))
