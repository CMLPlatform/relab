"""Behavior-focused tests for file and image CRUD entrypoints."""

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile
from pydantic import ValidationError

from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.exceptions import ModelFileNotFoundError, UploadTooLargeError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateInternal

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
TEST_IMAGE_DESC = "Test image"
IMAGE_FILENAME = "image.png"
FAKE_PATH = "/fake/path/test.txt"
FAKE_IMAGE_PATH = "/fake/path/test.png"
CONTENT_TYPE_PNG = "image/png"
MB = 1024 * 1024


def test_file_create_rejects_quota_user_fields() -> None:
    """Upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        FileCreate(
            file=mock_file,
            description=TEST_FILE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),
        )


async def test_create_file_rejects_oversized_upload(mock_session: AsyncMock) -> None:
    """Rejects file uploads above the size limit."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 51 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 50 MB"):
        await file_storage_service.create(mock_session, file_create)


async def test_create_file_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generic file uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.file_storage.crud.support_services.settings.max_file_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await file_storage_service.create(mock_session, file_create)


async def test_delete_product_file_releases_upload_quota(mock_session: AsyncMock) -> None:
    """Deleting product-owned files should release the owner's upload ledger."""
    file_id = uuid4()
    mock_db_file = MagicMock(spec=File)
    mock_db_file.file.path = FAKE_PATH
    mock_db_file.parent_type = MediaParentType.PRODUCT
    mock_db_file.parent_id = 1
    mock_db_file.upload_size_bytes = 1024

    with (
        patch("app.api.file_storage.crud.support_services.require_locked_model", return_value=mock_db_file),
        patch("app.api.file_storage.crud.support_services.delete_file_from_storage"),
        patch(
            "app.api.file_storage.crud.support_services.release_product_upload_quota_for_media",
            new=AsyncMock(),
        ) as release_quota,
    ):
        await file_storage_service.delete(mock_session, file_id)

    release_quota.assert_awaited_once_with(mock_session, mock_db_file)


def test_image_create_rejects_quota_user_fields() -> None:
    """Image upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ImageCreateInternal(
            file=mock_file,
            description=TEST_IMAGE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),
        )


async def test_create_image_rejects_oversized_upload(mock_session: AsyncMock) -> None:
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
        await image_storage_service.create(mock_session, image_create)


async def test_create_image_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Image uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.file_storage.crud.support_services.settings.max_image_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await image_storage_service.create(mock_session, image_create)


async def test_delete_image_cleans_thumbnails_when_original_is_missing(mock_session: AsyncMock) -> None:
    """Cleans up derived image files when the original file record is missing."""
    image_id = uuid4()
    mock_db_image = MagicMock(spec=Image)
    mock_db_image.file.path = FAKE_IMAGE_PATH
    mock_session.get.return_value = mock_db_image

    with (
        patch(
            "app.api.file_storage.crud.support_services.require_locked_model",
            side_effect=ModelFileNotFoundError(Image, image_id),
        ),
        patch(
            "app.api.file_storage.crud.support_services.delete_image_from_storage",
            new=AsyncMock(),
        ) as mock_delete_image,
        patch("app.api.file_storage.crud.support_services.release_product_upload_quota_for_media", new=AsyncMock()),
    ):
        await image_storage_service.delete(mock_session, image_id)

    mock_session.delete.assert_called_once_with(mock_db_image)
    mock_delete_image.assert_awaited_once_with(mock_db_image)
