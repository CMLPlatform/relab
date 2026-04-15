"""Unit tests for file storage routers."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.file_storage.routers import get_resized_image

if TYPE_CHECKING:
    from pathlib import Path

# Constants to avoid magic values
IMAGE_WIDTH = 200
IMAGE_HEIGHT = 150


def _make_request() -> MagicMock:
    return MagicMock()


def _make_db_image(path: str | None = None) -> MagicMock:
    db_image = MagicMock()
    if path is not None:
        db_image.file = MagicMock()
        db_image.file.path = path
    else:
        db_image.file = None
    return db_image


@pytest.mark.unit
class TestGetResizedImage:
    """Tests for the GET /images/{image_id}/resized endpoint handler."""

    async def test_returns_webp_response_when_file_exists(self, tmp_path: Path) -> None:
        """Test that a valid image returns a WebP response."""
        image_file = tmp_path / "test.jpg"
        image_file.write_bytes(b"fake image bytes")

        db_image = _make_db_image(str(image_file))
        request = _make_request()
        image_id = uuid4()
        fake_session = AsyncMock()

        with (
            patch("app.api.file_storage.routers.get_image", return_value=db_image),
            patch("app.api.file_storage.routers.AsyncPath") as mock_path_cls,
            patch("app.api.file_storage.routers.to_thread.run_sync", return_value=b"resized_bytes"),
        ):
            mock_path_cls.return_value.exists = AsyncMock(return_value=True)
            response = await get_resized_image(request, image_id, fake_session, width=IMAGE_WIDTH, height=IMAGE_HEIGHT)

        assert response.body == b"resized_bytes"
        assert response.media_type == "image/webp"
        assert "Cache-Control" in response.headers

    async def test_raises_404_when_file_record_has_no_path(self) -> None:
        """Test that 404 is raised when image has no file path."""
        db_image = MagicMock()
        db_image.file.path = None
        request = _make_request()
        fake_session = AsyncMock()

        with (
            patch("app.api.file_storage.routers.get_image", return_value=db_image),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_resized_image(request, uuid4(), fake_session)

        assert exc_info.value.status_code == 404

    async def test_raises_404_when_file_not_on_disk(self) -> None:
        """Test that 404 is raised when file path doesn't exist on disk."""
        db_image = _make_db_image("/nonexistent/path/image.jpg")
        request = _make_request()
        fake_session = AsyncMock()

        with (
            patch("app.api.file_storage.routers.get_image", return_value=db_image),
            patch("app.api.file_storage.routers.AsyncPath") as mock_path_cls,
        ):
            mock_path_cls.return_value.exists = AsyncMock(return_value=False)
            with pytest.raises(HTTPException) as exc_info:
                await get_resized_image(request, uuid4(), fake_session)

        assert exc_info.value.status_code == 404
        assert "disk" in exc_info.value.detail.lower()

    async def test_raises_500_on_unexpected_error(self, tmp_path: Path) -> None:
        """Test that unexpected errors during resize result in 500."""
        image_file = tmp_path / "test.jpg"
        image_file.write_bytes(b"fake image bytes")

        db_image = _make_db_image(str(image_file))
        request = _make_request()
        fake_session = AsyncMock()

        with (
            patch("app.api.file_storage.routers.get_image", return_value=db_image),
            patch("app.api.file_storage.routers.AsyncPath") as mock_path_cls,
            patch("app.api.file_storage.routers.to_thread.run_sync", side_effect=RuntimeError("resize failed")),
        ):
            mock_path_cls.return_value.exists = AsyncMock(return_value=True)
            with pytest.raises(HTTPException) as exc_info:
                await get_resized_image(request, uuid4(), fake_session)

        assert exc_info.value.status_code == 500
        assert "resizing" in exc_info.value.detail.lower()
