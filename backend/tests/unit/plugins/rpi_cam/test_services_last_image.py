"""Tests for ``get_last_image_url_per_camera`` — the mosaic thumbnail query."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from app.api.file_storage import schemas as file_storage_schemas
from app.api.file_storage.models import Image, MediaParentType
from app.api.plugins.rpi_cam.services import get_last_image_url_per_camera

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(autouse=True)
def _stub_image_url_builder(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub ``ImageRead.model_validate`` so the query doesn't need real files on disk.

    ``get_last_image_url_per_camera`` calls ``ImageRead.model_validate(image)``
    to compute each URL, which walks the storage filesystem under the real
    implementation. For unit tests we swap it for a deterministic fake that
    echoes the image id — that way the ``newest wins`` assertion can check
    which exact row came back per camera without touching the FS.
    """

    class _FakeImageRead:
        def __init__(self, image_url: str | None) -> None:
            self.image_url = image_url

        @classmethod
        def model_validate(cls, image: Image) -> _FakeImageRead:  # type: ignore[name-defined]
            return cls(image_url=f"/fake/images/{image.id.hex}.jpg")

    # Patch the symbol in the file_storage.schemas module since the
    # services.get_last_image_url_per_camera uses a lazy import.
    monkeypatch.setattr(file_storage_schemas, "ImageRead", _FakeImageRead)


async def _persist_image(
    session: AsyncSession,
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
    session.add(image)
    await session.flush()
    # Pin created_at after the ORM insert so we can force a deterministic
    # ordering across multiple rows in the same test.
    image.created_at = created_at
    await session.flush()
    return image


@pytest.mark.asyncio
async def test_empty_input_returns_empty_dict(session: AsyncSession) -> None:
    """An empty ``camera_ids`` list should short-circuit to ``{}``."""
    result = await get_last_image_url_per_camera(session, [])
    assert result == {}


@pytest.mark.asyncio
async def test_returns_most_recent_image_per_camera(session: AsyncSession) -> None:
    """For each camera, the URL of the most recently-created image wins."""
    cam_a = uuid.uuid4()
    cam_b = uuid.uuid4()

    now = datetime.now(UTC)
    # Older capture on camera A → should be ignored in favour of the newer one.
    await _persist_image(session, camera_id=cam_a, product_id=1, created_at=now - timedelta(hours=2))
    newest_a = await _persist_image(session, camera_id=cam_a, product_id=1, created_at=now - timedelta(minutes=5))
    newest_b = await _persist_image(session, camera_id=cam_b, product_id=2, created_at=now - timedelta(minutes=10))
    await session.commit()

    result = await get_last_image_url_per_camera(session, [cam_a, cam_b])

    # Every camera in the request list is present in the response, even if
    # some don't have any images yet.
    assert set(result.keys()) == {cam_a, cam_b}
    # URLs come from ImageRead.model_validate — shape-check only; the exact
    # path is a ``file_storage`` concern, not ours.
    assert result[cam_a] is not None
    assert result[cam_b] is not None
    # The newest capture (not the older one) should win per camera. The
    # ImageRead stub encodes the image's UUID hex into the URL so we can
    # verify exactly which row came back.
    assert newest_a.id.hex in (result[cam_a] or "")
    assert newest_b.id.hex in (result[cam_b] or "")


@pytest.mark.asyncio
async def test_camera_with_no_images_gets_none(session: AsyncSession) -> None:
    """A camera in the request list with no captures must come back as ``None``."""
    cam_with_image = uuid.uuid4()
    cam_without_image = uuid.uuid4()

    await _persist_image(
        session,
        camera_id=cam_with_image,
        product_id=1,
        created_at=datetime.now(UTC),
    )
    await session.commit()

    result = await get_last_image_url_per_camera(session, [cam_with_image, cam_without_image])

    assert result[cam_with_image] is not None
    assert result[cam_without_image] is None


@pytest.mark.asyncio
async def test_ignores_images_with_no_camera_id_in_metadata(session: AsyncSession) -> None:
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
    session.add(legacy)
    await session.commit()

    result = await get_last_image_url_per_camera(session, [cam])

    assert result == {cam: None}
