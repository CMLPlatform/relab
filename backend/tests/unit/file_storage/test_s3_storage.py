"""Test S3-compatible storage backend."""
# spell-checker: ignore AKIAIOSFODNN7EXAMPLE

import importlib
import io
import sys
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.api.file_storage.models.storage_s3 import S3Storage
from app.core.config import CoreSettings, StorageBackend

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


class MockClientError(Exception):
    """Mock ClientError that behaves like botocore.exceptions.ClientError."""

    def __init__(self, error_response: dict, _operation_name: str | None = None) -> None:
        self.response = error_response
        super().__init__()


@pytest.fixture
def mock_boto3(mocker: MockerFixture) -> MagicMock:
    """Fixture that provides mocked boto3 and botocore modules in sys.modules for lazy imports."""
    mock_boto3_module = MagicMock()
    mock_botocore = MagicMock()
    mock_exceptions = MagicMock()
    mock_exceptions.ClientError = MockClientError
    mock_botocore.exceptions = mock_exceptions
    mocker.patch.dict(
        sys.modules,
        {
            "boto3": mock_boto3_module,
            "botocore": mock_botocore,
            "botocore.exceptions": mock_exceptions,
        },
    )
    return mock_boto3_module


def _make_client_error(code: str, operation: str = "Operation") -> MockClientError:
    """Create a MockClientError with the given error code.

    Since botocore is optional, we create a mock that mimics ClientError's structure.
    """
    return MockClientError(
        {"Error": {"Code": code, "Message": f"Error: {code}"}},
        operation,
    )


class TestS3StoragePathConstruction:
    """Test URL/path construction for S3 objects."""

    def test_get_path_default_aws_url(self) -> None:
        """Test default AWS S3 URL format: https://bucket.s3.region.amazonaws.com/prefix/key."""
        storage = S3Storage(bucket="my-bucket", prefix="images", region="eu-west-1")
        path = storage.get_path("photo.jpg")
        assert path == "https://my-bucket.s3.eu-west-1.amazonaws.com/images/photo.jpg"

    def test_get_path_with_base_url(self) -> None:
        """Test custom base URL overrides AWS path."""
        storage = S3Storage(
            bucket="my-bucket",
            prefix="images",
            base_url="https://cdn.example.com/assets",
        )
        path = storage.get_path("photo.jpg")
        assert path == "https://cdn.example.com/assets/images/photo.jpg"

    def test_get_path_with_base_url_trailing_slash(self) -> None:
        """Test base URL with trailing slash is normalized."""
        storage = S3Storage(
            bucket="my-bucket",
            prefix="images",
            base_url="https://cdn.example.com/assets/",  # trailing slash
        )
        path = storage.get_path("photo.jpg")
        assert path == "https://cdn.example.com/assets/images/photo.jpg"

    def test_get_path_with_custom_endpoint(self) -> None:
        """Test S3-compatible endpoint (e.g. MinIO) URL format."""
        storage = S3Storage(
            bucket="my-bucket",
            prefix="images",
            endpoint_url="http://localhost:9000",
        )
        path = storage.get_path("photo.jpg")
        assert path == "http://localhost:9000/my-bucket/images/photo.jpg"

    def test_get_path_empty_prefix(self) -> None:
        """Test URL construction with empty prefix."""
        storage = S3Storage(bucket="my-bucket", prefix="")
        path = storage.get_path("photo.jpg")
        assert path == "https://my-bucket.s3.us-east-1.amazonaws.com/photo.jpg"

    def test_get_name_sanitizes_filename(self) -> None:
        """Test that get_name normalizes filenames like filesystem backend."""
        storage = S3Storage(bucket="my-bucket", prefix="files")
        # Paths with directory separators should be stripped to just the basename
        assert storage.get_name("documents/report.pdf") == "report.pdf"
        # Special characters should be removed
        assert storage.get_name("hello world!@#.txt") == "hello_world.txt"


class TestS3StorageSyncOperations:
    """Test synchronous storage operations with mocked boto3."""

    def test_write_uploads_to_s3(self, mock_boto3: MagicMock) -> None:
        """Test write() calls upload_fileobj with correct bucket and key."""
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client

        storage = S3Storage(bucket="my-bucket", prefix="files")
        data = b"test content"
        result = storage.write(io.BytesIO(data), "document.txt")

        assert result == "document.txt"
        mock_client.upload_fileobj.assert_called_once()
        # Verify upload was called with correct bucket and key.
        assert mock_client.upload_fileobj.call_args.kwargs == {
            "Bucket": "my-bucket",
            "Key": "files/document.txt",
        }

    def test_open_returns_file_contents(self, mock_boto3: MagicMock) -> None:
        """Test open() returns BytesIO with object contents."""
        mock_body = MagicMock()
        mock_body.read.return_value = b"file contents"
        mock_client = MagicMock()
        mock_client.get_object.return_value = {"Body": mock_body}
        mock_boto3.client.return_value = mock_client

        storage = S3Storage(bucket="my-bucket", prefix="files")
        result = storage.open("document.txt")

        assert isinstance(result, io.BytesIO)
        assert result.getvalue() == b"file contents"
        mock_client.get_object.assert_called_once_with(Bucket="my-bucket", Key="files/document.txt")

    def test_open_raises_on_missing_file(self, mock_boto3: MagicMock) -> None:
        """Test open() raises FastAPIStorageFileNotFoundError for missing objects."""
        mock_client = MagicMock()
        error = _make_client_error("NoSuchKey", "GetObject")
        mock_client.get_object.side_effect = error
        mock_boto3.client.return_value = mock_client

        storage = S3Storage(bucket="my-bucket", prefix="files")

        with pytest.raises(FastAPIStorageFileNotFoundError):
            storage.open("missing.txt")

    def test_boto3_import_error_on_lazy_use(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test helpful error message when boto3 is not installed."""
        # Ensure boto3 is not available for import
        monkeypatch.delitem(sys.modules, "boto3", raising=False)
        monkeypatch.setattr(
            "app.api.file_storage.models.storage_s3.import_module",
            lambda name: (_ for _ in ()).throw(ImportError(f"No module named '{name}'"))
            if name == "boto3"
            else importlib.import_module(name),
        )

        storage = S3Storage(bucket="my-bucket", prefix="files")

        with pytest.raises(ImportError, match="boto3 is required for S3 storage") as exc_info:
            storage.get_size("file.txt")
        assert "uv sync --group s3" in str(exc_info.value)

class TestS3StorageAsyncOperations:
    """Test asynchronous upload operations."""

    @pytest.mark.asyncio
    async def test_write_upload_uploads_to_s3(self, mock_boto3: MagicMock) -> None:
        """Test write_upload() streams file to S3 in thread pool."""
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client

        # Mock the upload_fileobj to track it was called
        upload_called = []

        def mock_upload(_fileobj: object, **kwargs: object) -> None:
            upload_called.append((str(kwargs["Bucket"]), str(kwargs["Key"])))

        mock_client.upload_fileobj = mock_upload

        # Create a mock UploadFile
        mock_file = MagicMock()
        mock_file.file = io.BytesIO(b"test data")
        mock_file.seek = AsyncMock()
        mock_file.read = AsyncMock(return_value=b"test data")
        mock_file.close = AsyncMock()

        storage = S3Storage(bucket="my-bucket", prefix="images")
        result = await storage.write_upload(mock_file, "photo.jpg")

        assert result == "photo.jpg"
        assert upload_called == [("my-bucket", "images/photo.jpg")]
        mock_file.seek.assert_called_once_with(0)
        mock_file.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_image_upload_validates_then_uploads(
        self, mock_boto3: MagicMock, mocker: MockerFixture
    ) -> None:
        """Test write_image_upload() validates image before upload."""
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_validate = mocker.patch("app.api.file_storage.models.storage_s3.validate_image_file")

        mock_file = MagicMock()
        mock_file.file = io.BytesIO(b"fake image data")
        mock_file.seek = AsyncMock()
        mock_file.read = AsyncMock(return_value=b"fake image data")
        mock_file.close = AsyncMock()

        storage = S3Storage(bucket="my-bucket", prefix="images")
        result = await storage.write_image_upload(mock_file, "photo.jpg")

        assert result == "photo.jpg"
        # Validation should be called on the file object
        mock_validate.assert_called_once()
        mock_file.close.assert_called_once()


class TestConfigValidation:
    """Test S3 configuration validation."""

    def test_s3_backend_requires_bucket(self) -> None:
        """Test that storage_backend='s3' requires s3_bucket to be set."""
        with pytest.raises(ValueError, match="S3_BUCKET must be set"):
            CoreSettings(
                storage_backend=StorageBackend.S3,
                s3_bucket="",  # Empty bucket
            )

    def test_s3_backend_with_bucket_valid(self) -> None:
        """Test that storage_backend='s3' with bucket configured is valid."""
        settings = CoreSettings(
            storage_backend=StorageBackend.S3,
            s3_bucket="my-bucket",
        )
        assert settings.storage_backend == StorageBackend.S3
        assert settings.s3_bucket == "my-bucket"

    def test_filesystem_backend_ignores_s3_config(self) -> None:
        """Test that filesystem backend doesn't require S3 config."""
        settings = CoreSettings(
            storage_backend=StorageBackend.FILESYSTEM,
            s3_bucket="",  # Empty S3 config is OK for filesystem
        )
        assert settings.storage_backend == StorageBackend.FILESYSTEM
