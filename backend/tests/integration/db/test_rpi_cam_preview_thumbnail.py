"""Tests for preview-thumbnail URL helpers."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import pytest

from app.api.plugins.rpi_cam.runtime_preview import get_preview_thumbnail_urls_per_camera
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.db


async def test_preview_thumbnail_helper_returns_public_url_when_file_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The preview-thumbnail helper should expose deterministic upload URLs."""
    camera_id = uuid.uuid4()
    monkeypatch.setattr(settings, "image_storage_path", tmp_path)
    path = tmp_path / "rpi-cam-preview" / f"{camera_id}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"preview-bytes")

    result = get_preview_thumbnail_urls_per_camera([camera_id])

    expected_mtime = int(path.stat().st_mtime)
    assert result[camera_id] == f"/uploads/images/rpi-cam-preview/{camera_id}.jpg?v={expected_mtime}"


async def test_preview_thumbnail_helper_returns_none_when_file_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing preview-thumbnail files should produce ``None`` entries."""
    camera_id = uuid.uuid4()
    monkeypatch.setattr(settings, "image_storage_path", tmp_path)

    result = get_preview_thumbnail_urls_per_camera([camera_id])

    assert result[camera_id] is None
