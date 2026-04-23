"""Behavior-focused tests for file-storage utility helpers."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import UploadFile

from app.api.file_storage.crud.support_paths import delete_image_from_storage
from app.api.file_storage.crud.support_uploads import process_uploadfile_name, sanitize_filename

TEST_SAN_RAW = "test file.txt"
TEST_SAN_CLEAN = "test-file.txt"
ARC_TAR_GZ = "archive.tar.gz"
MY_DOC_PDF = "my-document.pdf"
MY_DOC_RAW = "my document.pdf"
FAKE_IMAGE_PATH = "/fake/path/test.png"


class TestFileStorageCrudUtils:
    """Test utility functions for file storage."""

    def test_sanitize_filename(self) -> None:
        """Test filename sanitization."""
        assert sanitize_filename(TEST_SAN_RAW) == TEST_SAN_CLEAN
        assert sanitize_filename(ARC_TAR_GZ) == ARC_TAR_GZ

        long_name = "a" * 50 + ".pdf"
        sanitized = sanitize_filename(long_name, max_length=10)
        assert sanitized.endswith(".pdf")
        assert len(sanitized) <= 15

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

    async def test_delete_image_from_storage_removes_thumbnails_and_original(self) -> None:
        """Image storage cleanup removes generated thumbnails before the original."""
        image_path = Path(FAKE_IMAGE_PATH)

        with (
            patch("app.api.file_storage.crud.support_paths.to_thread.run_sync", new=AsyncMock()) as mock_run_sync,
            patch(
                "app.api.file_storage.crud.support_paths.delete_file_from_storage",
                new=AsyncMock(),
            ) as mock_delete_file,
        ):
            await delete_image_from_storage(image_path)

        mock_run_sync.assert_awaited_once()
        mock_delete_file.assert_awaited_once_with(image_path)
