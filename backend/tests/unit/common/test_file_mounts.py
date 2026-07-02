"""Tests for static and upload-backed file serving."""
# spell-checker: ignore évil

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.common.routers.file_mounts import mount_static_directories
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path


def _mounted_uploads_client(tmp_path, monkeypatch) -> tuple[TestClient, Path, Path]:  # noqa: ANN001
    uploads = tmp_path / "uploads"
    files = uploads / "files"
    images = uploads / "images"
    static = tmp_path / "static"
    files.mkdir(parents=True)
    images.mkdir()
    static.mkdir()

    monkeypatch.setattr(settings, "uploads_path", uploads)
    monkeypatch.setattr(settings, "file_storage_path", files)
    monkeypatch.setattr(settings, "image_storage_path", images)
    monkeypatch.setattr(settings, "static_files_path", static)

    app = FastAPI()
    mount_static_directories(app)
    return TestClient(app), files, images


def test_upload_file_responses_are_downloads_with_nosniff(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    """Generic uploaded files should be served as downloads with MIME sniffing disabled."""
    client, files, _images = _mounted_uploads_client(tmp_path, monkeypatch)
    files.joinpath("manual.pdf").write_bytes(b"%PDF-1.7\n")

    response = client.get("/uploads/files/manual.pdf")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"] == 'attachment; filename="manual.pdf"'


def test_upload_file_download_header_encodes_unsafe_names(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    """Download headers should encode unsafe request-path filenames for HTTP header contexts."""
    client, files, _images = _mounted_uploads_client(tmp_path, monkeypatch)
    filename = 'manual évil "quote".pdf'
    files.joinpath(filename).write_bytes(b"%PDF-1.7\n")

    response = client.get(f"/uploads/files/{quote(filename)}")

    assert response.status_code == 200
    header = response.headers["content-disposition"]
    assert header == f"attachment; filename*=utf-8''{quote(filename)}"
    assert "\r" not in header
    assert "\n" not in header
    assert '"quote"' not in header


def test_upload_image_responses_stay_inline_with_nosniff(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    """Uploaded images should remain inline for app galleries."""
    client, _files, images = _mounted_uploads_client(tmp_path, monkeypatch)
    images.joinpath("photo.jpg").write_bytes(b"\xff\xd8\xff\xd9")

    response = client.get("/uploads/images/photo.jpg")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-disposition" not in response.headers
