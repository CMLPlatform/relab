"""Tests for Pi-initiated upload routes."""

from __future__ import annotations

from io import BytesIO
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, UploadFile

from app.api.auth.exceptions import UserOwnershipError
from app.api.data_collection.models.product import Product
from app.api.plugins.rpi_cam.routers.camera_interaction.images import (
    receive_camera_upload,
    receive_preview_thumbnail_upload,
)
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

    from app.api.plugins.rpi_cam.models import Camera


class TestReceiveCameraUpload:
    """Tests for device-pushed image uploads."""

    @pytest.mark.parametrize(
        ("capture_metadata", "upload_metadata", "expected_detail"),
        [
            ("{", '{"product_id": 1}', "capture_metadata must be valid JSON"),
            ("{}", "{", "upload_metadata must be valid JSON"),
            ("[]", '{"product_id": 1}', "capture_metadata must be a JSON object"),
            ("{}", "[]", "upload_metadata must be a JSON object"),
        ],
    )
    async def test_rejects_invalid_json_metadata(
        self,
        mock_camera: Camera,
        capture_metadata: str,
        upload_metadata: str,
        expected_detail: str,
    ) -> None:
        """Device uploads should only accept JSON object metadata fields."""
        upload = UploadFile(filename="capture.jpg", file=BytesIO(b"jpeg-bytes"))

        with pytest.raises(HTTPException) as exc_info:
            await receive_camera_upload(
                camera_id=mock_camera.id,
                camera=mock_camera,
                session=MagicMock(),
                file=upload,
                capture_metadata=capture_metadata,
                upload_metadata=upload_metadata,
            )

        assert exc_info.value.status_code == 400
        assert str(exc_info.value.detail).startswith(expected_detail)

    async def test_rejects_upload_for_product_not_owned_by_camera_owner(self, mock_camera: Camera) -> None:
        """A paired device may only attach captures to products owned by its owner."""
        upload = UploadFile(filename="capture.jpg", file=BytesIO(b"jpeg-bytes"))
        foreign_product_id = 1

        with (
            patch(
                "app.api.plugins.rpi_cam.routers.camera_interaction.images.get_user_owned_object",
                new=AsyncMock(
                    side_effect=UserOwnershipError(Product, foreign_product_id, mock_camera.owner_id),
                ),
            ),
            patch(
                "app.api.plugins.rpi_cam.routers.camera_interaction.images.create_image",
                new=AsyncMock(),
            ) as mock_create_image,
            pytest.raises(UserOwnershipError),
        ):
            await receive_camera_upload(
                camera_id=mock_camera.id,
                camera=mock_camera,
                session=MagicMock(),
                file=upload,
                capture_metadata="{}",
                upload_metadata=f'{{"product_id": {foreign_product_id}}}',
            )

        mock_create_image.assert_not_awaited()


class TestReceivePreviewThumbnailUpload:
    """Tests for cached preview-thumbnail uploads from the Pi."""

    async def test_persists_deterministic_preview_thumbnail_and_returns_url(
        self,
        mock_camera: Camera,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A device upload should overwrite the deterministic preview-thumbnail cache file."""
        monkeypatch.setattr(settings, "image_storage_path", tmp_path)
        upload = UploadFile(filename="preview.jpg", file=BytesIO(b"preview-bytes"))

        ack = await receive_preview_thumbnail_upload(camera_id=mock_camera.id, camera=mock_camera, file=upload)

        path = tmp_path / "rpi-cam-preview" / f"{mock_camera.id}.jpg"
        assert path.read_bytes() == b"preview-bytes"
        expected_mtime = int(path.stat().st_mtime)
        assert ack.preview_thumbnail_url == f"/uploads/images/rpi-cam-preview/{mock_camera.id}.jpg?v={expected_mtime}"

    async def test_rejects_empty_preview_thumbnail_upload(
        self,
        mock_camera: Camera,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Empty uploads should fail with a client error instead of writing a bogus cache file."""
        monkeypatch.setattr(settings, "image_storage_path", tmp_path)
        upload = UploadFile(filename="preview.jpg", file=BytesIO(b""))

        with pytest.raises(HTTPException) as exc_info:
            await receive_preview_thumbnail_upload(camera_id=mock_camera.id, camera=mock_camera, file=upload)

        assert exc_info.value.status_code == 400
        assert "empty" in str(exc_info.value.detail).lower()
