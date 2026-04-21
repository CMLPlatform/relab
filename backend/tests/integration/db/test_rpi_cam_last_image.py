"""Tests for mosaic capture and preview-thumbnail URL helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from app.api.file_storage.models import Image, MediaParentType
from app.api.plugins.rpi_cam import service_runtime as rpi_cam_service_runtime
from app.api.plugins.rpi_cam.services import (
    get_last_image_urls_per_camera,
    get_preview_thumbnail_urls_per_camera,
)
from app.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.db


@pytest.fixture(autouse=True)
def _stub_image_url_builder(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub ``ImageRead.model_validate`` so the query doesn't need real files on disk.

    ``get_last_image_urls_per_camera`` calls ``ImageRead.model_validate(image)``
    to compute each URL, which walks the storage filesystem under the real
    implementation. For unit tests we swap it for a deterministic fake that
    echoes the image id — that way the ``newest wins`` assertion can check
    which exact row came back per camera without touching the FS.
    """

    class _FakeImageRead:
        def __init__(self, image_url: str | None, thumbnail_url: str | None) -> None:
            self.image_url = image_url
            self.thumbnail_url = thumbnail_url

        @classmethod
        def model_validate(cls, image: Image) -> _FakeImageRead:
            return cls(
                image_url=f"/fake/images/{image.id.hex}.jpg",
                thumbnail_url=f"/fake/images/{image.id.hex}-thumb.webp",
            )

    # Patch the name as it is bound in the services module — the top-level
    # ``from ... import ImageRead`` creates a local reference there, so we must
    # target that reference rather than the originating schema module.
    monkeypatch.setattr(rpi_cam_service_runtime, "ImageRead", _FakeImageRead)


async def _persist_image(
    db_session: AsyncSession,
    *,
    camera_id: UUID,
    product_id: int,
    created_at: datetime,
    filename: str = "capture.jpg",
) -> Image:
    """Insert an Image row with ``camera_id`` stamped into its metadata.

    We pass the filename as a plain string: the ``ImageType`` column accepts
    either an ``UploadValue`` (for real uploads) or a string (for internal
    bookkeeping). A stable string-based identity is all the query cares about.
    """
    image = Image(
        filename=filename,
        file=f"{camera_id}-{product_id}-{created_at.timestamp()}.jpg",
        description=f"test capture for camera {camera_id}",
        image_metadata={"camera_id": str(camera_id)},
        parent_type=MediaParentType.PRODUCT,
        parent_id=product_id,
    )
    db_session.add(image)
    await db_session.flush()
    # Pin created_at after the ORM insert so we can force a deterministic
    # ordering across multiple rows in the same test.
    image.created_at = created_at
    await db_session.flush()
    return image


async def test_empty_input_returns_empty_dict(db_session: AsyncSession) -> None:
    """An empty ``camera_ids`` list should short-circuit to ``{}``."""
    result = await get_last_image_urls_per_camera(db_session, [])
    assert result == {}


async def test_returns_most_recent_image_per_camera(db_session: AsyncSession) -> None:
    """For each camera, the URL of the most recently-created image wins."""
    cam_a = uuid.uuid4()
    cam_b = uuid.uuid4()

    now = datetime.now(UTC)
    # Older capture on camera A → should be ignored in favour of the newer one.
    await _persist_image(db_session, camera_id=cam_a, product_id=1, created_at=now - timedelta(hours=2))
    newest_a = await _persist_image(db_session, camera_id=cam_a, product_id=1, created_at=now - timedelta(minutes=5))
    newest_b = await _persist_image(db_session, camera_id=cam_b, product_id=2, created_at=now - timedelta(minutes=10))
    await db_session.commit()

    result = await get_last_image_urls_per_camera(db_session, [cam_a, cam_b])

    # Every camera in the request list is present in the response, even if
    # some don't have any images yet.
    assert set(result.keys()) == {cam_a, cam_b}
    # URLs come from ImageRead.model_validate — shape-check only; the exact
    # path is a ``file_storage`` concern, not ours.
    assert result[cam_a].image_url is not None
    assert result[cam_a].thumbnail_url is not None
    assert result[cam_b].image_url is not None
    assert result[cam_b].thumbnail_url is not None
    # The newest capture (not the older one) should win per camera. The
    # ImageRead stub encodes the image's UUID hex into the URL so we can
    # verify exactly which row came back.
    assert newest_a.id.hex in (result[cam_a].image_url or "")
    assert newest_a.id.hex in (result[cam_a].thumbnail_url or "")
    assert newest_b.id.hex in (result[cam_b].image_url or "")
    assert newest_b.id.hex in (result[cam_b].thumbnail_url or "")


async def test_camera_with_no_images_gets_none(db_session: AsyncSession) -> None:
    """A camera in the request list with no captures must come back as ``None``."""
    cam_with_image = uuid.uuid4()
    cam_without_image = uuid.uuid4()

    await _persist_image(
        db_session,
        camera_id=cam_with_image,
        product_id=1,
        created_at=datetime.now(UTC),
    )
    await db_session.commit()

    result = await get_last_image_urls_per_camera(db_session, [cam_with_image, cam_without_image])

    assert result[cam_with_image].image_url is not None
    assert result[cam_without_image].image_url is None
    assert result[cam_without_image].thumbnail_url is None


async def test_ignores_images_with_no_camera_id_in_metadata(db_session: AsyncSession) -> None:
    """Legacy images without ``camera_id`` in metadata must not leak into results."""
    cam = uuid.uuid4()

    # Legacy image: no camera_id in metadata, shouldn't match anything.
    legacy = Image(
        filename="legacy.jpg",
        file="legacy.jpg",
        description="legacy capture with no camera_id in metadata",
        image_metadata={},
        parent_type=MediaParentType.PRODUCT,
        parent_id=1,
    )
    db_session.add(legacy)
    await db_session.commit()

    result = await get_last_image_urls_per_camera(db_session, [cam])

    assert result[cam].image_url is None
    assert result[cam].thumbnail_url is None


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

    assert result[camera_id] == f"/uploads/images/rpi-cam-preview/{camera_id}.jpg"


async def test_preview_thumbnail_helper_returns_none_when_file_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing preview-thumbnail files should produce ``None`` entries."""
    camera_id = uuid.uuid4()
    monkeypatch.setattr(settings, "image_storage_path", tmp_path)

    result = get_preview_thumbnail_urls_per_camera([camera_id])

    assert result[camera_id] is None
