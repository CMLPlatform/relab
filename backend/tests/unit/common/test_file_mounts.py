"""Tests for static and upload-backed file serving."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.common.routers.file_mounts import mount_static_directories
from app.core.config import settings


def test_upload_file_responses_are_downloads_with_nosniff(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    """Generic uploaded files should be served as downloads with MIME sniffing disabled."""
    uploads = tmp_path / "uploads"
    files = uploads / "files"
    images = uploads / "images"
    static = tmp_path / "static"
    files.mkdir(parents=True)
    images.mkdir()
    static.mkdir()
    (files / "manual.pdf").write_bytes(b"%PDF-1.7\n")

    monkeypatch.setattr(settings, "uploads_path", uploads)
    monkeypatch.setattr(settings, "static_files_path", static)

    app = FastAPI()
    mount_static_directories(app)

    response = TestClient(app).get("/uploads/files/manual.pdf")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"] == 'attachment; filename="manual.pdf"'


def test_upload_image_responses_stay_inline_with_nosniff(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    """Uploaded images should remain inline for app galleries."""
    uploads = tmp_path / "uploads"
    files = uploads / "files"
    images = uploads / "images"
    static = tmp_path / "static"
    files.mkdir(parents=True)
    images.mkdir()
    static.mkdir()
    (images / "photo.jpg").write_bytes(b"\xff\xd8\xff\xd9")

    monkeypatch.setattr(settings, "uploads_path", uploads)
    monkeypatch.setattr(settings, "static_files_path", static)

    app = FastAPI()
    mount_static_directories(app)

    response = TestClient(app).get("/uploads/images/photo.jpg")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-disposition" not in response.headers
