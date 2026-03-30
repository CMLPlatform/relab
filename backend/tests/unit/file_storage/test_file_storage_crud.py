"""Unit tests for file storage CRUD operations."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile
from pydantic import HttpUrl

from app.api.data_collection.models import Product
from app.api.file_storage import crud, video_crud
from app.api.file_storage.crud import (
    ParentStorageOperations,
    create_file,
    delete_file,
    delete_file_from_storage,
    process_uploadfile_name,
    sanitize_filename,
)
from app.api.file_storage.exceptions import ParentStorageOwnershipError, UploadTooLargeError
from app.api.file_storage.models.models import File, Image, MediaParentType, Video
from app.api.file_storage.schemas import FileCreate, FileUpdate, ImageCreateInternal, ImageUpdate, VideoCreate
from tests.factories.models import ProductFactory

# Constants for magic values
TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
TEST_IMAGE_DESC = "Test image"
IMAGE_FILENAME = "image.png"
TEST_VIDEO_TITLE = "Test vid"
UPDATED_DESC = "Updated description"
UPDATED_IMAGE_DESC = "Updated image obj"
FAKE_PATH = "/fake/path/test.txt"
FAKE_IMAGE_PATH = "/fake/path/test.png"
YOUTUBE_URL = HttpUrl("https://youtube.com/test")
CONTENT_TYPE_PNG = "image/png"
TEST_SAN_RAW = "test file.txt"
TEST_SAN_CLEAN = "test-file.txt"
ARC_TAR_GZ = "archive.tar.gz"
MY_DOC_PDF = "my-document.pdf"
MY_DOC_RAW = "my document.pdf"
MB = 1024 * 1024


@pytest.fixture
def mock_session() -> AsyncMock:
    """Return a mock database session."""
    session = AsyncMock()
    session.add = MagicMock()
    session.add_all = MagicMock()
    return session


class TestFileStorageCrudUtils:
    """Test utility functions for file storage."""

    def test_sanitize_filename(self) -> None:
        """Test filename sanitization."""
        # Standard case
        assert sanitize_filename(TEST_SAN_RAW) == TEST_SAN_CLEAN

        # Multiple suffixes
        assert sanitize_filename(ARC_TAR_GZ) == ARC_TAR_GZ

        # Truncate long name (keeps suffix)
        long_name = "a" * 50 + ".pdf"
        sanitized = sanitize_filename(long_name, max_length=10)
        assert sanitized.endswith(".pdf")
        assert len(sanitized) <= 10 + 4 + 1  # max_len + len(.pdf) + possible hyphen and _

    def test_process_uploadfile_name_success(self) -> None:
        """Test UploadFile name processing."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = MY_DOC_RAW

        file, file_id, original = process_uploadfile_name(mock_file)

        assert original == MY_DOC_PDF
        assert file_id is not None
        assert file.filename == f"{file_id.hex}_{MY_DOC_PDF}"

    def test_process_uploadfile_name_empty(self) -> None:
        """Test UploadFile name processing with empty filename."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = None

        with pytest.raises(ValueError, match="File name is empty"):
            process_uploadfile_name(mock_file)


class TestFileStorageCrud:
    """Test CRUD operations for generic files."""

    async def test_create_file_success(self, mock_session: AsyncMock) -> None:
        """Test creating a file."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = TEST_FILENAME
        mock_file.size = 1024
        mock_file.file = BytesIO(b"test content")

        file_create = FileCreate(
            file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with (
            patch("app.api.file_storage.crud.get_file_parent_type_model") as mock_parent_model,
            patch("app.api.file_storage.crud.get_model_or_404"),
            patch.object(crud.file_storage_service, "_storage") as mock_storage,
        ):
            mock_parent_model.return_value = MagicMock()
            mock_storage.write_upload = AsyncMock(return_value="stored_test.txt")

            result = await create_file(mock_session, file_create)

            assert isinstance(result, File)
            assert result.description == TEST_FILE_DESC
            assert result.filename == TEST_FILENAME
            assert result.parent_type == MediaParentType.PRODUCT
            assert result.parent_id == 1

            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()
            mock_session.refresh.assert_called_once()

    async def test_create_file_accepts_missing_upload_size(self, mock_session: AsyncMock) -> None:
        """Test creating a file when UploadFile.size is unavailable."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = TEST_FILENAME
        mock_file.size = None
        mock_file.file = BytesIO(b"test content")

        file_create = FileCreate(
            file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with (
            patch("app.api.file_storage.crud.get_model_or_404"),
            patch.object(crud.file_storage_service, "_storage") as mock_storage,
        ):
            mock_storage.write_upload = AsyncMock(return_value="stored_test.txt")

            result = await create_file(mock_session, file_create)

            assert isinstance(result, File)
            assert result.filename == TEST_FILENAME

    async def test_create_file_rejects_oversized_upload(self, mock_session: AsyncMock) -> None:
        """Test creating a file larger than the configured maximum."""
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
        """Test deleting a file from db and storage."""
        file_id = uuid4()

        mock_db_file = MagicMock(spec=File)
        mock_db_file.file.path = FAKE_PATH

        with (
            patch("app.api.file_storage.crud.get_model_or_404", return_value=mock_db_file),
            patch("app.api.file_storage.crud.delete_file_from_storage") as mock_delete_from_storage,
        ):
            await delete_file(mock_session, file_id)

            mock_session.delete.assert_called_once_with(mock_db_file)
            mock_session.commit.assert_called_once()
            mock_delete_from_storage.assert_called_once_with(Path(FAKE_PATH))

    async def test_delete_file_from_storage(self) -> None:
        """Test the async filesystem unlink."""
        fake_path = Path("fake_storage_file.txt")

        with patch("app.api.file_storage.crud.AnyIOPath") as mock_anyio_path:
            mock_instance = mock_anyio_path.return_value
            mock_instance.exists = AsyncMock(return_value=True)
            mock_instance.unlink = AsyncMock()

            await delete_file_from_storage(fake_path)

            mock_instance.exists.assert_called_once()
            mock_instance.unlink.assert_called_once()

    async def test_update_file_success(self, mock_session: AsyncMock) -> None:
        """Test updating a file."""
        file_id = uuid4()
        mock_db_file = MagicMock(spec=File)
        file_update = FileUpdate(description=UPDATED_DESC)

        with patch("app.api.file_storage.crud.get_model_or_404", return_value=mock_db_file):
            result = await crud.update_file(mock_session, file_id, file_update)
            assert result == mock_db_file
            mock_db_file.sqlmodel_update.assert_called_once()
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()


class TestImageStorageCrud:
    """Test CRUD operations for image files."""

    async def test_create_image_internal_success(self, mock_session: AsyncMock) -> None:
        """Test creating an image internally."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = IMAGE_FILENAME
        mock_file.content_type = CONTENT_TYPE_PNG
        mock_file.size = 1024
        mock_file.file = BytesIO(b"fake image bytes")
        mock_file.path = None  # UploadFile has no .path; set explicitly so getattr fallback works

        image_create = ImageCreateInternal(
            file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with (
            patch(
                "app.api.file_storage.crud.get_model_or_404",
                return_value=ProductFactory.build(id=1, owner_id=uuid4(), first_image_id=uuid4()),
            ),
            patch.object(crud.image_storage_service, "_storage") as mock_storage,
        ):
            mock_storage.write_image_upload = AsyncMock(return_value="stored_image.png")
            result = await crud.create_image(mock_session, image_create)
            assert isinstance(result, Image)
            assert result.description == TEST_IMAGE_DESC
            assert result.filename == IMAGE_FILENAME

    async def test_create_image_rejects_oversized_upload(self, mock_session: AsyncMock) -> None:
        """Test creating an image larger than the configured maximum."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = IMAGE_FILENAME
        mock_file.content_type = CONTENT_TYPE_PNG
        mock_file.size = 11 * MB
        mock_file.file = BytesIO(b"")

        image_create = ImageCreateInternal(
            file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
        )

        with pytest.raises(UploadTooLargeError, match="Maximum size: 10 MB"):
            await crud.create_image(mock_session, image_create)

    async def test_update_image_success(self, mock_session: AsyncMock) -> None:
        """Test updating an image."""
        image_id = uuid4()
        mock_db_image = MagicMock(spec=Image)
        image_update = ImageUpdate(description=UPDATED_IMAGE_DESC)

        with patch("app.api.file_storage.crud.get_model_or_404", return_value=mock_db_image):
            result = await crud.update_image(mock_session, image_id, image_update)
            assert result == mock_db_image

    async def test_delete_image_success(self, mock_session: AsyncMock) -> None:
        """Test deleting an image."""
        image_id = uuid4()
        mock_db_image = MagicMock(spec=Image)
        mock_db_image.file.path = FAKE_IMAGE_PATH

        with (
            patch("app.api.file_storage.crud.get_model_or_404", return_value=mock_db_image),
            patch("app.api.file_storage.crud.delete_file_from_storage"),
        ):
            await crud.delete_image(mock_session, image_id)
            mock_session.delete.assert_called_once_with(mock_db_image)


class TestVideoCrud:
    """Test CRUD operations for video entries."""

    async def test_create_video_success(self, mock_session: AsyncMock) -> None:
        """Test creating a video."""
        video_create = VideoCreate(url=YOUTUBE_URL, product_id=1, title=TEST_VIDEO_TITLE)

        with patch("app.api.file_storage.video_crud.get_model_or_404"):
            result = await video_crud.create_video(mock_session, video_create, commit=True)
            assert isinstance(result, Video)
            assert result.title == TEST_VIDEO_TITLE

    async def test_delete_video_success(self, mock_session: AsyncMock) -> None:
        """Test deleting a video."""
        video_id = 1
        mock_db_video = MagicMock(spec=Video)

        with patch("app.api.file_storage.video_crud.get_model_or_404", return_value=mock_db_video):
            await video_crud.delete_video(mock_session, video_id)
            mock_session.delete.assert_called_once()


class TestParentStorageOperations:
    """Test parent-scoped storage operations."""

    async def test_create_rejects_parent_scope_mismatch(self, mock_session: AsyncMock) -> None:
        """Create should fail if the payload is not already scoped to the target parent."""
        operations = ParentStorageOperations(
            parent_model=Product,
            storage_model=Image,
            parent_type=MediaParentType.PRODUCT,
            parent_field="product_id",
            storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
        )

        file_create = FileCreate(
            file=MagicMock(spec=UploadFile, filename=TEST_FILENAME, size=1024),
            description=TEST_FILE_DESC,
            parent_id=2,
            parent_type=MediaParentType.MATERIAL,
        )

        with pytest.raises(ValueError, match="Parent ID mismatch"):
            await operations.create(mock_session, 1, file_create)

    async def test_delete_removes_db_record_when_storage_file_is_missing(self, mock_session: AsyncMock) -> None:
        """Delete should succeed even if the underlying file is already gone."""
        storage_service = MagicMock()
        storage_service.delete = AsyncMock()
        operations = ParentStorageOperations(
            parent_model=Product,
            storage_model=Image,
            parent_type=MediaParentType.PRODUCT,
            parent_field="product_id",
            storage_service=storage_service,
        )

        item_id = uuid4()
        db_item = MagicMock(spec=Image)
        db_item.product_id = 1
        mock_session.get.return_value = db_item

        with patch("app.api.file_storage.crud.get_model_or_404"):
            await operations.delete(mock_session, 1, item_id)

        storage_service.delete.assert_awaited_once_with(mock_session, item_id)

    async def test_get_by_id_raises_not_found_for_wrong_parent(self, mock_session: AsyncMock) -> None:
        """Fetching an item through the wrong parent should return a parent-scoped not found error."""
        operations = ParentStorageOperations(
            parent_model=Product,
            storage_model=Image,
            parent_type=MediaParentType.PRODUCT,
            parent_field="product_id",
            storage_service=MagicMock(create=AsyncMock(), delete=AsyncMock()),
        )

        item_id = uuid4()
        db_item = MagicMock(spec=Image)
        db_item.product_id = 2
        db_item.file_exists = True
        mock_session.get.return_value = db_item

        with (
            patch("app.api.file_storage.crud.get_model_or_404"),
            pytest.raises(ParentStorageOwnershipError, match="not found for"),
        ):
            await operations.get_by_id(mock_session, 1, item_id)
