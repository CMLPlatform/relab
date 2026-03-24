"""Test custom logic of file storage types."""

import io
from typing import TYPE_CHECKING

from app.api.file_storage.models.custom_types import CustomFileSystemStorage
from app.main import ensure_storage_directories

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


def test_custom_storage_is_lazy_about_creating_directories(tmp_path: Path) -> None:
    """Test that CustomFileSystemStorage does not create the storage directory until a file is written."""
    storage_dir = tmp_path / "files"

    # Ensure directory does not exist before instantiation
    assert not storage_dir.exists()

    storage = CustomFileSystemStorage(path=str(storage_dir))

    # Instantiation should NOT create the directory
    assert not storage_dir.exists()

    # Writing a file should create the directory and write the file
    data = b"hello"
    storage.write(file=io.BytesIO(data), name="greeting.txt")

    written_path = storage_dir / "greeting.txt"
    assert storage_dir.exists()
    assert written_path.exists()
    assert written_path.read_bytes() == data


def test_custom_storage_calls_mkdir_on_each_write(tmp_path: Path, mocker: MockerFixture) -> None:
    """Test that CustomFileSystemStorage.write ensures the directory on each write."""
    storage_dir = tmp_path / "files_once"

    # Mock Path.mkdir and the parent's write method to avoid actual disk I/O
    mock_mkdir = mocker.patch("pathlib.Path.mkdir")
    mock_super_write = mocker.patch("app.api.file_storage.models.storage.FileSystemStorage.write")

    storage = CustomFileSystemStorage(path=str(storage_dir))

    # First write should call mkdir
    storage.write(file=io.BytesIO(b"first"), name="1.txt")
    assert mock_mkdir.call_count == 1
    assert mock_super_write.call_count == 1

    # Second write to same storage should call mkdir again
    storage.write(file=io.BytesIO(b"second"), name="2.txt")
    assert mock_mkdir.call_count == 2
    assert mock_super_write.call_count == 2

    # New storage instance with SAME path should still call mkdir
    storage2 = CustomFileSystemStorage(path=str(storage_dir))
    storage2.write(file=io.BytesIO(b"third"), name="3.txt")
    assert mock_mkdir.call_count == 3
    assert mock_super_write.call_count == 3


def test_ensure_storage_directories_creates_expected_paths(mocker: MockerFixture) -> None:
    """Test that startup storage directory creation calls mkdir for both paths."""
    mock_mkdir = mocker.patch("pathlib.Path.mkdir")

    ensure_storage_directories()

    # Should call mkdir for file and image paths
    assert mock_mkdir.call_count == 2
