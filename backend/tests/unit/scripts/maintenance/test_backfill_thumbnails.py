"""Unit tests for the thumbnail backfill script."""

from typing import TYPE_CHECKING

from PIL import Image as PILImage

from app.core.images import thumbnail_path_for
from scripts.maintenance import backfill_thumbnails as backfill

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


def _write_image(path: Path, width: int, height: int) -> None:
    PILImage.new("RGB", (width, height)).save(path, format="PNG")


async def test_thumbnails_only_the_originals_that_lack_them(tmp_path: Path, mocker: MockerFixture) -> None:
    """Originals without a 200px thumbnail get one; already-thumbnailed ones are left alone."""
    missing = tmp_path / "missing.png"
    _write_image(missing, 1200, 900)
    done = tmp_path / "done.png"
    _write_image(done, 1200, 900)
    _write_image(thumbnail_path_for(done, 200), 200, 150)
    mocker.patch.object(backfill.settings, "image_storage_path", tmp_path)

    assert backfill.backfill_thumbnails() == 0

    assert thumbnail_path_for(missing, 200).exists()
    assert thumbnail_path_for(missing, 800).exists()
    # The already-thumbnailed original was skipped, so no wider sizes appeared for it.
    assert not thumbnail_path_for(done, 800).exists()


async def test_unreadable_file_does_not_abort_the_run(tmp_path: Path, mocker: MockerFixture) -> None:
    """A corrupt original is logged and skipped; the images after it are still thumbnailed."""
    (tmp_path / "a_corrupt.png").write_bytes(b"not an image")
    good = tmp_path / "b_good.png"
    _write_image(good, 1200, 900)
    mocker.patch.object(backfill.settings, "image_storage_path", tmp_path)

    assert backfill.backfill_thumbnails() == 0

    assert thumbnail_path_for(good, 200).exists()


async def test_skips_s3_storage(tmp_path: Path, mocker: MockerFixture) -> None:
    """Nothing is read when the objects live remotely."""
    _write_image(tmp_path / "x.png", 1200, 900)
    mocker.patch.object(backfill.settings, "image_storage_path", tmp_path)
    mocker.patch.object(backfill.settings, "storage_backend", backfill.StorageBackend.S3)

    assert backfill.backfill_thumbnails() == 0

    assert not thumbnail_path_for(tmp_path / "x.png", 200).exists()
