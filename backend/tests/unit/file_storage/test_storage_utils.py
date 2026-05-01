"""Behavior-focused tests for file-storage utility helpers."""
# spell-checker: ignore geocube HYPERSPECTRAL hyperspectral nitf officedocument wordprocessingml

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.api.common.exceptions import BadRequestError
from app.api.file_storage.crud.support_paths import delete_image_from_storage
from app.api.file_storage.crud.support_uploads import process_uploadfile_name, sanitize_filename
from app.api.file_storage.upload_policy import (
    HYPERSPECTRAL_FILE_EXTENSIONS,
    validate_generic_file_upload_metadata,
    validate_image_upload_metadata,
)

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
        assert sanitize_filename("Résumé photo 01.JPG") == "Resume-photo-01.JPG"

        long_name = "a" * 50 + ".pdf"
        sanitized = sanitize_filename(long_name, max_length=10)
        assert sanitized.endswith(".pdf")
        assert len(sanitized) <= 15

    def test_process_uploadfile_name_success(self) -> None:
        """Test UploadFile name processing."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = MY_DOC_RAW

        file, file_id, original, stored = process_uploadfile_name(mock_file)

        assert original == MY_DOC_PDF
        assert file_id is not None
        assert stored == f"{file_id.hex}.pdf"
        assert file.filename == stored

    def test_process_uploadfile_name_empty(self) -> None:
        """Test UploadFile name processing with empty filename."""
        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = None

        with pytest.raises(BadRequestError, match="File name is empty"):
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


def _upload(filename: str, content_type: str, content: bytes = b"sample") -> UploadFile:
    return UploadFile(file=BytesIO(content), filename=filename, headers=Headers({"content-type": content_type}))


class TestUploadPolicy:
    """Tests for centralized upload allowlists."""

    @pytest.mark.parametrize(
        ("filename", "content_type"),
        [
            ("manual.pdf", "application/pdf"),
            ("measurements.csv", "text/csv"),
            ("notes.md", "text/markdown"),
            ("metadata.json", "application/json"),
            ("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("cube.hdr", "text/plain"),
            ("cube.raw", "application/octet-stream"),
            ("cube.dat", "application/octet-stream"),
            ("cube.img", "application/octet-stream"),
            ("cube.h5", "application/x-hdf5"),
            ("cube.hdf5", "application/x-hdf5"),
            ("scene.ntf", "application/octet-stream"),
            ("scene.nitf", "application/octet-stream"),
            ("geocube.tif", "image/tiff"),
            ("geocube.tiff", "image/tiff"),
        ],
    )
    def test_generic_file_upload_policy_accepts_research_and_hyperspectral_extensions(
        self, filename: str, content_type: str
    ) -> None:
        """Generic file uploads allow research docs and hyperspectral data formats."""
        assert validate_generic_file_upload_metadata(_upload(filename, content_type)).filename == filename

    @pytest.mark.parametrize("extension", sorted(HYPERSPECTRAL_FILE_EXTENSIONS))
    def test_image_upload_policy_rejects_hyperspectral_extensions(self, extension: str) -> None:
        """Hyperspectral data belongs in file uploads, not image processing routes."""
        with pytest.raises(BadRequestError, match="not supported for image uploads"):
            validate_image_upload_metadata(_upload(f"cube{extension}", "image/tiff"))

    @pytest.mark.parametrize(
        "filename",
        [
            "run.exe",
            "archive.zip",
            "report.pdf.exe",
            "payload.jpg.php",
            "diagram.svg",
            ".hidden.pdf",
            " leading.pdf",
            "nested/manual.pdf",
            "nested\\manual.pdf",
        ],
    )
    def test_generic_file_upload_policy_rejects_dangerous_or_unknown_names(self, filename: str) -> None:
        """Dangerous names and unsupported extensions are rejected before storage."""
        with pytest.raises(BadRequestError, match=r"not supported|must not|multiple extensions"):
            validate_generic_file_upload_metadata(_upload(filename, "application/octet-stream"))
