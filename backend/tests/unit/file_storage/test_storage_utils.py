"""Behavior-focused tests for file-storage utility helpers."""

from io import BytesIO
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import pytest
from fastapi import UploadFile
from PIL import Image as PILImage
from starlette.datastructures import Headers

from app.api.common.exceptions import BadRequestError
from app.api.file_storage.crud.support_paths import (
    delete_file_from_storage,
    delete_image_from_storage,
    storage_item_exists,
    stored_file_path,
)
from app.api.file_storage.crud.support_uploads import process_uploadfile_name, sanitize_filename
from app.api.file_storage.models import File, Image
from app.api.file_storage.models.storage_filesystem import FileSystemStorage

if TYPE_CHECKING:
    from pathlib import Path
from app.api.file_storage.upload_policy import (
    HYPERSPECTRAL_FILE_EXTENSIONS,
    validate_generic_file_upload_content,
    validate_generic_file_upload_metadata,
    validate_image_upload_content,
    validate_image_upload_metadata,
)

TEST_SAN_RAW = "test file.txt"
TEST_SAN_CLEAN = "test-file.txt"
ARC_TAR_GZ = "archive.tar.gz"
MY_DOC_PDF = "my-document.pdf"
MY_DOC_RAW = "my document.pdf"
FAKE_IMAGE_PATH = "/fake/path/test.png"
ZIP_MEMBER_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def test_sanitize_filename() -> None:
    """Test filename sanitization."""
    assert sanitize_filename(TEST_SAN_RAW) == TEST_SAN_CLEAN
    assert sanitize_filename(ARC_TAR_GZ) == ARC_TAR_GZ
    assert sanitize_filename("Résumé photo 01.JPG") == "Resume-photo-01.JPG"

    long_name = "a" * 50 + ".pdf"
    sanitized = sanitize_filename(long_name, max_length=10)
    assert sanitized.endswith(".pdf")
    assert len(sanitized) <= 15


def test_process_uploadfile_name_success() -> None:
    """Test UploadFile name processing."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = MY_DOC_RAW

    file, file_id, original, stored = process_uploadfile_name(mock_file)

    assert original == MY_DOC_PDF
    assert file_id is not None
    assert stored == f"{file_id.hex}.pdf"
    assert file.filename == stored


def test_process_uploadfile_name_empty() -> None:
    """Test UploadFile name processing with empty filename."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = None

    with pytest.raises(BadRequestError, match="File name is empty"):
        process_uploadfile_name(mock_file)


def _storage_item(model: type, *, path: str, name: str):
    """Build a minimal storage-model mock exposing ``item.file.path``/``.name``."""
    item = MagicMock(spec=model)
    item.file.path = path
    item.file.name = name
    return item


async def test_delete_image_from_storage_removes_thumbnails_and_original() -> None:
    """Local-image storage cleanup removes generated thumbnails, then the original."""
    image = _storage_item(Image, path=FAKE_IMAGE_PATH, name="test.png")
    mock_storage = MagicMock()
    mock_storage.delete = AsyncMock()

    with (
        patch("app.api.file_storage.crud.support_paths.to_thread.run_sync", new=AsyncMock()) as mock_run_sync,
        patch("app.api.file_storage.crud.support_paths._get_image_storage", return_value=mock_storage),
    ):
        await delete_image_from_storage(image)

    mock_run_sync.assert_awaited_once()
    mock_storage.delete.assert_awaited_once_with("test.png")


async def test_delete_image_from_storage_skips_local_thumbnail_cleanup_for_remote_image() -> None:
    """A remote (S3) image has no local thumbnails to remove, only the backend object."""
    image = _storage_item(Image, path="https://bucket.s3.eu-west-1.amazonaws.com/media/test.png", name="test.png")
    mock_storage = MagicMock()
    mock_storage.delete = AsyncMock()

    with (
        patch("app.api.file_storage.crud.support_paths.to_thread.run_sync", new=AsyncMock()) as mock_run_sync,
        patch("app.api.file_storage.crud.support_paths._get_image_storage", return_value=mock_storage),
    ):
        await delete_image_from_storage(image)

    mock_run_sync.assert_not_called()
    mock_storage.delete.assert_awaited_once_with("test.png")


async def test_delete_file_from_storage_routes_through_resolved_backend() -> None:
    """File deletion calls the resolved storage backend with the item's stored name.

    Regression: deletion used to unlink a local ``Path`` directly, so an S3-backed
    file (whose ``stored_file_path`` is ``None``) was silently never deleted.
    """
    file_item = _storage_item(File, path=FAKE_IMAGE_PATH, name="document.pdf")
    mock_storage = MagicMock()
    mock_storage.delete = AsyncMock()

    with patch("app.api.file_storage.crud.support_paths._get_file_storage", return_value=mock_storage):
        await delete_file_from_storage(file_item)

    mock_storage.delete.assert_awaited_once_with("document.pdf")


async def test_filesystem_storage_delete_removes_written_file(tmp_path: Path) -> None:
    """The filesystem backend's delete removes a file it wrote."""
    storage = FileSystemStorage(path=str(tmp_path), create_path=True)
    target = tmp_path / "written.txt"
    target.write_bytes(b"data")

    await storage.delete("written.txt")

    assert not target.exists()


async def test_filesystem_storage_delete_tolerates_already_missing_file(tmp_path: Path) -> None:
    """Deletion should tolerate a concurrent remover winning the unlink race."""
    storage = FileSystemStorage(path=str(tmp_path), create_path=True)

    await storage.delete("never-existed.txt")


def _upload(filename: str, content_type: str, content: bytes = b"sample") -> UploadFile:
    return UploadFile(file=BytesIO(content), filename=filename, headers=Headers({"content-type": content_type}))


def _zip_bytes(paths: list[str]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for path in paths:
            archive.writestr(ZipInfo(path, date_time=ZIP_MEMBER_TIMESTAMP), "<xml />", compress_type=ZIP_DEFLATED)
    return buffer.getvalue()


def _zip_bytes_with_info(entries: list[tuple[ZipInfo, bytes]]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for info, content in entries:
            info.date_time = ZIP_MEMBER_TIMESTAMP
            archive.writestr(info, content, compress_type=ZIP_DEFLATED)
    return buffer.getvalue()


DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("manual.pdf", "application/pdf"),
        ("measurements.csv", "text/csv"),
        ("notes.md", "text/markdown"),
        ("metadata.json", "application/json"),
        ("report.docx", DOCX_CONTENT_TYPE),
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
    filename: str, content_type: str
) -> None:
    """Generic file uploads allow research docs and hyperspectral data formats."""
    assert validate_generic_file_upload_metadata(_upload(filename, content_type)).filename == filename


@pytest.mark.parametrize(
    "filename",
    ["sample.v2.csv", "2024-01-15.dat", "spectrum.400-700nm.tsv", "run.2.h5"],
)
def test_generic_file_upload_policy_accepts_dotted_names_with_allowed_final_extension(filename: str) -> None:
    """Dotted research filenames are accepted when the final extension is on the allowlist."""
    assert validate_generic_file_upload_metadata(_upload(filename, "application/octet-stream")).filename == filename


@pytest.mark.parametrize("extension", sorted(HYPERSPECTRAL_FILE_EXTENSIONS))
def test_image_upload_policy_rejects_hyperspectral_extensions(extension: str) -> None:
    """Hyperspectral data belongs in file uploads, not image processing routes."""
    with pytest.raises(BadRequestError, match="not supported for image uploads"):
        validate_image_upload_metadata(_upload(f"cube{extension}", "image/tiff"))


@pytest.mark.parametrize(
    ("filename", "content_type", "message"),
    [
        ("notes.csv", "image/png", "not supported for image uploads"),
        ("photo.png", "application/pdf", "Invalid image MIME type"),
        ("photo.png", "image/jpeg", "does not match file extension"),
    ],
)
def test_image_upload_policy_rejects_mismatched_metadata(filename: str, content_type: str, message: str) -> None:
    """The declared MIME type and the extension must agree on a supported image format."""
    with pytest.raises(BadRequestError, match=message):
        validate_image_upload_metadata(_upload(filename, content_type))


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
def test_generic_file_upload_policy_rejects_dangerous_or_unknown_names(filename: str) -> None:
    """Dangerous names and unsupported extensions are rejected before storage."""
    with pytest.raises(BadRequestError, match=r"not supported|must not|multiple extensions"):
        validate_generic_file_upload_metadata(_upload(filename, "application/octet-stream"))


@pytest.mark.parametrize(
    ("filename", "content_type", "content"),
    [
        ("manual.pdf", "application/pdf", b"%PDF-1.7\n"),
        ("metadata.json", "application/json", b'{"bands": 224}'),
        ("cube.h5", "application/x-hdf5", b"\x89HDF\r\n\x1a\n"),
        ("scene.ntf", "application/octet-stream", b"NITF02.10"),
        ("geocube.tif", "image/tiff", b"II*\x00"),
        ("report.docx", DOCX_CONTENT_TYPE, _zip_bytes(["[Content_Types].xml", "word/document.xml"])),
        ("table.xlsx", XLSX_CONTENT_TYPE, _zip_bytes(["[Content_Types].xml", "xl/workbook.xml"])),
        ("deck.pptx", PPTX_CONTENT_TYPE, _zip_bytes(["[Content_Types].xml", "ppt/presentation.xml"])),
    ],
)
def test_generic_file_upload_content_accepts_stable_format_signatures(
    filename: str, content_type: str, content: bytes
) -> None:
    """Stable research file formats get lightweight content sanity checks."""
    upload = _upload(filename, content_type, content)

    assert validate_generic_file_upload_content(upload).filename == filename
    assert upload.file.tell() == 0


@pytest.mark.parametrize(
    ("filename", "content_type", "content"),
    [
        ("manual.pdf", "application/pdf", b"<html>not a pdf</html>"),
        ("metadata.json", "application/json", b"{not json"),
        ("cube.h5", "application/x-hdf5", b"not hdf5"),
        ("scene.ntf", "application/octet-stream", b"not nitf"),
        ("geocube.tif", "image/tiff", b"not tiff"),
        ("report.docx", DOCX_CONTENT_TYPE, _zip_bytes(["[Content_Types].xml", "xl/workbook.xml"])),
        ("table.xlsx", XLSX_CONTENT_TYPE, b"not a zip"),
    ],
)
def test_generic_file_upload_content_rejects_stable_format_mismatches(
    filename: str, content_type: str, content: bytes
) -> None:
    """Allowed extensions with clearly mismatched bytes are rejected."""
    upload = _upload(filename, content_type, content)

    with pytest.raises(BadRequestError, match="does not match"):
        validate_generic_file_upload_content(upload)
    assert upload.file.tell() == 0


@pytest.mark.parametrize(
    ("paths", "message"),
    [
        (["[Content_Types].xml", "word/document.xml", "../evil.xml"], "path information"),
        (["[Content_Types].xml", "word/document.xml", "/absolute.xml"], "path information"),
        (["[Content_Types].xml", "word/document.xml", "nested\\evil.xml"], "path information"),
    ],
)
def test_ooxml_upload_rejects_zip_slip_paths(paths: list[str], message: str) -> None:
    """Compressed uploads must ignore user-provided path tricks before processing."""
    upload = _upload("report.docx", DOCX_CONTENT_TYPE, _zip_bytes(paths))

    with pytest.raises(BadRequestError, match=message):
        validate_generic_file_upload_content(upload)
    assert upload.file.tell() == 0


def test_ooxml_upload_rejects_too_many_files(monkeypatch: pytest.MonkeyPatch) -> None:
    """Compressed uploads must cap member count before accepting the archive."""
    monkeypatch.setattr("app.api.file_storage.upload_policy.MAX_COMPRESSED_FILE_COUNT", 2)
    upload = _upload(
        "report.docx",
        DOCX_CONTENT_TYPE,
        _zip_bytes(["[Content_Types].xml", "word/document.xml", "extra.xml"]),
    )

    with pytest.raises(BadRequestError, match="too many files"):
        validate_generic_file_upload_content(upload)
    assert upload.file.tell() == 0


def test_ooxml_upload_rejects_excessive_uncompressed_size(monkeypatch: pytest.MonkeyPatch) -> None:
    """Compressed uploads must cap unpacked size before accepting the archive."""
    monkeypatch.setattr("app.api.file_storage.upload_policy._max_compressed_unpacked_size_bytes", lambda: 10)
    upload = _upload(
        "report.docx",
        DOCX_CONTENT_TYPE,
        _zip_bytes_with_info(
            [
                (ZipInfo("[Content_Types].xml"), b"<xml />"),
                (ZipInfo("word/document.xml"), b"x" * 20),
            ]
        ),
    )

    with pytest.raises(BadRequestError, match="uncompressed size"):
        validate_generic_file_upload_content(upload)
    assert upload.file.tell() == 0


def test_ooxml_upload_rejects_symlink_members() -> None:
    """Compressed uploads must reject symlink entries."""
    symlink = ZipInfo("word/link.xml")
    symlink.create_system = 3
    symlink.external_attr = 0o120777 << 16
    upload = _upload(
        "report.docx",
        DOCX_CONTENT_TYPE,
        _zip_bytes_with_info(
            [
                (ZipInfo("[Content_Types].xml"), b"<xml />"),
                (ZipInfo("word/document.xml"), b"<xml />"),
                (symlink, b"target"),
            ]
        ),
    )

    with pytest.raises(BadRequestError, match="symlink"):
        validate_generic_file_upload_content(upload)
    assert upload.file.tell() == 0


def test_image_upload_content_rejects_pixel_flood_images() -> None:
    """Image uploads must reject dimensions over the configured pixel cap before storage."""
    buffer = BytesIO()
    PILImage.new("RGB", (8001, 1), color="red").save(buffer, format="PNG")
    upload = _upload("photo.png", "image/png", buffer.getvalue())

    with pytest.raises(BadRequestError, match="exceed"):
        validate_image_upload_content(upload)
    assert upload.file.tell() == 0


def _item_with_path(path: str | None):
    """Build a minimal file-backed item exposing ``item.file.path``."""
    item = MagicMock()
    item.file.path = path
    return item


def test_storage_item_exists_treats_remote_url_as_present(tmp_path: Path) -> None:
    """The S3 backend stores a URL in ``file.path``; it must count as present.

    Regression: ``Path(url).exists()`` is always False, so every S3-backed item was
    silently filtered out of media listings.
    """
    remote = _item_with_path("https://bucket.s3.eu-west-1.amazonaws.com/media/x.jpg")
    assert storage_item_exists(remote) is True
    # Local filesystem operations must skip a remote object rather than treat the URL as a path.
    assert stored_file_path(remote) is None

    missing = tmp_path / "gone.jpg"
    local_missing = _item_with_path(str(missing))
    assert storage_item_exists(local_missing) is False

    present = tmp_path / "here.jpg"
    present.write_bytes(b"x")
    local_present = _item_with_path(str(present))
    assert storage_item_exists(local_present) is True
    assert stored_file_path(local_present) == present

    assert storage_item_exists(_item_with_path(None)) is False
