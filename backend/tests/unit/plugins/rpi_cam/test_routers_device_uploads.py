"""Tests for Pi-initiated upload routes."""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile

from app.api.plugins.rpi_cam.routers.camera_interaction.images import receive_preview_thumbnail_upload
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

    from app.api.plugins.rpi_cam.models import Camera


class TestReceivePreviewThumbnailUpload:
    """Tests for cached preview-thumbnail uploads from the Pi."""

    async def test_persists_deterministic_preview_thumbnail_and_returns_url(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A device upload should overwrite the deterministic preview-thumbnail cache file."""
        camera_id = uuid4()
        monkeypatch.setattr(settings, "image_storage_path", tmp_path)
        camera = cast("Camera", SimpleNamespace(id=camera_id, name="Bench Cam"))
        upload = UploadFile(filename="preview.jpg", file=BytesIO(b"preview-bytes"))

        ack = await receive_preview_thumbnail_upload(camera_id=camera_id, camera=camera, file=upload)

        path = tmp_path / "rpi-cam-preview" / f"{camera_id}.jpg"
        assert path.read_bytes() == b"preview-bytes"
        expected_mtime = int(path.stat().st_mtime)
        assert ack.preview_thumbnail_url == f"/uploads/images/rpi-cam-preview/{camera_id}.jpg?v={expected_mtime}"

    async def test_rejects_empty_preview_thumbnail_upload(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Empty uploads should fail with a client error instead of writing a bogus cache file."""
        camera_id = uuid4()
        monkeypatch.setattr(settings, "image_storage_path", tmp_path)
        camera = cast("Camera", SimpleNamespace(id=camera_id, name="Bench Cam"))
        upload = UploadFile(filename="preview.jpg", file=BytesIO(b""))

        with pytest.raises(HTTPException) as exc_info:
            await receive_preview_thumbnail_upload(camera_id=camera_id, camera=camera, file=upload)

        assert exc_info.value.status_code == 400
        assert "empty" in str(exc_info.value.detail).lower()
