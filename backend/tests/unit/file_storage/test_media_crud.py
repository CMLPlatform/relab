"""Behavior-focused tests for file and image CRUD entrypoints."""

from io import BytesIO
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from anyio import to_thread
from fastapi import UploadFile
from PIL import Image as PILImage
from pydantic import ValidationError

from app.api.file_storage.crud import support_services
from app.api.file_storage.crud.support_services import (
    _generate_deferred_thumbnails,
    file_storage_service,
    image_storage_service,
)
from app.api.file_storage.exceptions import ModelFileNotFoundError, UploadTooLargeError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateInternal
from app.core.images import (
    DEFERRED_THUMBNAIL_WIDTHS,
    EAGER_THUMBNAIL_WIDTHS,
    THUMBNAIL_WIDTHS,
    deferred_thumbnail_limiter,
    generate_thumbnails,
    image_resize_limiter,
    thumbnail_path_for,
    thumbnails,
)

if TYPE_CHECKING:
    from pathlib import Path

TEST_FILE_DESC = "Test file"
TEST_FILENAME = "test.txt"
TEST_IMAGE_DESC = "Test image"
IMAGE_FILENAME = "image.png"
FAKE_PATH = "/fake/path/test.txt"
FAKE_IMAGE_PATH = "/fake/path/test.png"
CONTENT_TYPE_PNG = "image/png"
MB = 1024 * 1024


def test_file_create_rejects_quota_user_fields() -> None:
    """Upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        FileCreate(
            file=mock_file,
            description=TEST_FILE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),
        )


async def test_create_file_rejects_oversized_upload(mock_session: AsyncMock) -> None:
    """Rejects file uploads above the size limit."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 51 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 50 MB"):
        await file_storage_service.create(mock_session, file_create)


async def test_create_file_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generic file uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.file_storage.crud.support_services.settings.max_file_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = TEST_FILENAME
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    file_create = FileCreate(
        file=mock_file, description=TEST_FILE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await file_storage_service.create(mock_session, file_create)


async def test_delete_product_file_releases_upload_quota(mock_session: AsyncMock) -> None:
    """Deleting product-owned files should release the owner's upload ledger."""
    file_id = uuid4()
    mock_db_file = MagicMock(spec=File)
    mock_db_file.file.path = FAKE_PATH
    mock_db_file.parent_type = MediaParentType.PRODUCT
    mock_db_file.parent_id = 1
    mock_db_file.upload_size_bytes = 1024

    with (
        patch("app.api.file_storage.crud.support_services.require_locked_model", return_value=mock_db_file),
        patch("app.api.file_storage.crud.support_services.delete_file_from_storage"),
        patch(
            "app.api.file_storage.crud.support_services.release_product_upload_quota_for_media",
            new=AsyncMock(),
        ) as release_quota,
    ):
        await file_storage_service.delete(mock_session, file_id)

    release_quota.assert_awaited_once_with(mock_session, mock_db_file)


def test_image_create_rejects_quota_user_fields() -> None:
    """Image upload payload schemas should not expose quota-accounting fields."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ImageCreateInternal(
            file=mock_file,
            description=TEST_IMAGE_DESC,
            parent_id=1,
            parent_type=MediaParentType.PRODUCT,
            quota_user_id=uuid4(),
        )


async def test_create_image_rejects_oversized_upload(mock_session: AsyncMock) -> None:
    """Rejects image uploads above the size limit."""
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = 11 * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 10 MB"):
        await image_storage_service.create(mock_session, image_create)


async def test_create_image_uses_configured_upload_size_limit(
    mock_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Image uploads should use the configured limit instead of a module constant."""
    monkeypatch.setattr("app.api.file_storage.crud.support_services.settings.max_image_upload_size_mb", 2)
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = IMAGE_FILENAME
    mock_file.content_type = CONTENT_TYPE_PNG
    mock_file.size = 3 * MB
    mock_file.file = BytesIO(b"")

    image_create = ImageCreateInternal(
        file=mock_file, description=TEST_IMAGE_DESC, parent_id=1, parent_type=MediaParentType.PRODUCT
    )

    with pytest.raises(UploadTooLargeError, match="Maximum size: 2 MB"):
        await image_storage_service.create(mock_session, image_create)


async def test_delete_image_cleans_thumbnails_when_original_is_missing(mock_session: AsyncMock) -> None:
    """Cleans up derived image files when the original file record is missing."""
    image_id = uuid4()
    mock_db_image = MagicMock(spec=Image)
    mock_db_image.file.path = FAKE_IMAGE_PATH
    mock_session.get.return_value = mock_db_image

    with (
        patch(
            "app.api.file_storage.crud.support_services.require_locked_model",
            side_effect=ModelFileNotFoundError(Image, image_id),
        ),
        patch(
            "app.api.file_storage.crud.support_services.delete_image_from_storage",
            new=AsyncMock(),
        ) as mock_delete_image,
        patch("app.api.file_storage.crud.support_services.release_product_upload_quota_for_media", new=AsyncMock()),
    ):
        await image_storage_service.delete(mock_session, image_id)

    mock_session.delete.assert_called_once_with(mock_db_image)
    mock_delete_image.assert_awaited_once_with(mock_db_image)


async def test_deferred_pass_completes_the_thumbnail_set_left_by_the_upload(tmp_path: Path) -> None:
    """Uploads generate only the narrow width inline; the detached pass fills the rest."""
    image_path = tmp_path / "wide.png"
    PILImage.new("RGB", (3200, 1600), color="green").save(image_path)

    generate_thumbnails(image_path, EAGER_THUMBNAIL_WIDTHS)
    assert thumbnail_path_for(image_path, min(THUMBNAIL_WIDTHS)).exists()
    assert not any(thumbnail_path_for(image_path, width).exists() for width in DEFERRED_THUMBNAIL_WIDTHS)

    await _generate_deferred_thumbnails(image_path)

    assert all(thumbnail_path_for(image_path, width).exists() for width in THUMBNAIL_WIDTHS)


async def test_image_dimensions_are_committed_not_just_flushed(mock_session: AsyncMock, tmp_path: Path) -> None:
    """The post-processing UPDATE must commit, not flush.

    ``create()`` commits before calling ``after_create``, so the dimensions write runs in
    a fresh transaction that nothing else closes: flushing alone loses it when the request
    session is closed. The integration suite cannot see this: it binds every request to
    one connection whose transaction the fixture owns, so an uncommitted flush still reads
    back, which is why the guard lives here. It is also the only test that drives the
    real upload path, so it pins which thumbnail widths that path generates inline.
    """
    # Wider than every thumbnail width, so the inline pass is not silently narrowed by
    # the upscale skip and the recorded call names the widths the upload really ran.
    image_path = tmp_path / "shot.png"
    PILImage.new("RGB", (2001, 1234), color="red").save(image_path)
    db_image = Image(id=uuid4(), width_px=None, height_px=None)

    with (
        patch.object(support_services, "stored_file_path", return_value=image_path),
        patch.object(support_services, "require_model", AsyncMock(return_value=db_image)),
        patch.object(support_services, "generate_thumbnails") as mock_generate,
        # Close the coroutine instead of scheduling it: this test is about the DB write.
        patch.object(support_services, "spawn_detached", lambda coro, **_: coro.close()),
    ):
        await support_services._process_created_image(mock_session, db_image)

    assert (db_image.width_px, db_image.height_px) == (2001, 1234)
    mock_session.commit.assert_awaited()
    # The upload path generates the narrow width and nothing else: the wider two cost
    # most of the request's processing time and are the detached task's job.
    mock_generate.assert_called_once_with(image_path, EAGER_THUMBNAIL_WIDTHS)


async def test_deferred_pass_cleans_up_when_the_image_was_deleted_meanwhile(tmp_path: Path) -> None:
    """A delete landing after the wide thumbnails are written must not orphan them."""
    image_path = tmp_path / "gone.png"
    PILImage.new("RGB", (2000, 1000), color="blue").save(image_path)
    generate_thumbnails(image_path, EAGER_THUMBNAIL_WIDTHS)

    real_generate = generate_thumbnails

    def generate_then_delete(path: Path, widths: tuple[int, ...]) -> list[Path]:
        # The row's delete runs while this task holds the CPU: the wide widths are on
        # disk by then, so `delete_thumbnails` in the request path could not see them.
        written = real_generate(path, widths)
        path.unlink()
        return written

    with patch.object(support_services, "generate_thumbnails", generate_then_delete):
        await _generate_deferred_thumbnails(image_path)

    assert not any(thumbnail_path_for(image_path, width).exists() for width in DEFERRED_THUMBNAIL_WIDTHS)


async def test_deferred_pass_cleans_up_when_the_original_vanishes_mid_generation(tmp_path: Path) -> None:
    """A delete landing between two widths must not orphan the width already written.

    A JPEG original is re-opened once per width so ``draft`` can scale it in the DCT
    domain, so an account erasure or an image delete can remove it after the 800px
    thumbnail is on disk and before the 1600px open. That open raises ``FileNotFoundError``
    (an ``OSError``), and the widths written before it have no row pointing at them and
    no sweep that would ever find them.
    """
    image_path = tmp_path / "vanishing.jpg"
    PILImage.new("RGB", (2000, 1000), color="blue").save(image_path, format="JPEG")
    generate_thumbnails(image_path, EAGER_THUMBNAIL_WIDTHS)

    real_write = thumbnails._write_thumbnail

    def write_then_delete(img: PILImage.Image, path: Path, width: int, height: int) -> Path:
        written = real_write(img, path, width, height)
        path.unlink(missing_ok=True)
        return written

    with patch.object(thumbnails, "_write_thumbnail", write_then_delete):
        await _generate_deferred_thumbnails(image_path)

    assert not image_path.exists()
    assert not any(thumbnail_path_for(image_path, width).exists() for width in DEFERRED_THUMBNAIL_WIDTHS)


async def test_the_deferred_pass_runs_under_its_own_limiter(tmp_path: Path) -> None:
    """Deferred resizes must not share the queue an upload's inline resize waits in.

    anyio's capacity limiter is FIFO, so one limiter for both means upload N+1 waits
    behind every deferred job already queued; the deferral would then add to the
    response time it exists to remove.
    """
    image_path = tmp_path / "wide.png"
    PILImage.new("RGB", (2000, 1000), color="green").save(image_path)
    limiters: list[object] = []

    real_run_sync = to_thread.run_sync

    async def record_limiter(func: object, *args: object, limiter: object = None, **kwargs: object) -> object:
        limiters.append(limiter)
        return await real_run_sync(func, *args, limiter=limiter, **kwargs)

    with patch.object(support_services, "to_thread", SimpleNamespace(run_sync=record_limiter)):
        await _generate_deferred_thumbnails(image_path)

    assert limiters[0] is deferred_thumbnail_limiter()
    assert limiters[0] is not image_resize_limiter()
    assert deferred_thumbnail_limiter().total_tokens <= image_resize_limiter().total_tokens
