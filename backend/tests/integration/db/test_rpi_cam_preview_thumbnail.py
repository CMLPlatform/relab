"""Tests for preview-thumbnail URL helpers."""

import uuid
from typing import TYPE_CHECKING

from app.api.plugins.rpi_cam.runtime.preview import (
    get_preview_thumbnail_path,
    get_preview_thumbnail_urls_per_camera,
)
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


async def test_preview_thumbnail_helper_returns_public_url_when_file_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The preview-thumbnail helper should expose deterministic owner-checked API URLs."""
    camera_id = uuid.uuid4()
    monkeypatch.setattr(settings, "image_storage_path", tmp_path / "images")
    path = get_preview_thumbnail_path(camera_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"preview-bytes")

    # Never served from the public /uploads/images static mount.
    assert settings.image_storage_path not in path.parents

    result = get_preview_thumbnail_urls_per_camera([camera_id])

    expected_mtime = int(path.stat().st_mtime)
    assert result[camera_id] == f"/v1/plugins/rpi-cam/cameras/{camera_id}/preview-thumbnail?v={expected_mtime}"


async def test_preview_thumbnail_helper_returns_none_when_file_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing preview-thumbnail files should produce ``None`` entries."""
    camera_id = uuid.uuid4()
    monkeypatch.setattr(settings, "image_storage_path", tmp_path)

    result = get_preview_thumbnail_urls_per_camera([camera_id])

    assert result[camera_id] is None
