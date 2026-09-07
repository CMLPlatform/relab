"""Unit tests for the image-dimension backfill script."""

from types import SimpleNamespace
from typing import TYPE_CHECKING

from PIL import Image as PILImage

from scripts.maintenance import backfill_image_dimensions as backfill

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


def _row(image_id: int, path: str | None) -> SimpleNamespace:
    file = SimpleNamespace(path=path) if path else None
    return SimpleNamespace(id=image_id, file=file, width_px=None, height_px=None)


def _session_returning(batches: list[list[SimpleNamespace]], mocker: MockerFixture):
    """A session whose successive execute() calls yield the given row batches, then nothing."""
    results = []
    for rows in [*batches, []]:
        result = mocker.Mock()
        result.scalars.return_value.all.return_value = rows
        results.append(result)
    session = mocker.AsyncMock()
    session.execute.side_effect = results
    return session


async def test_measures_readable_rows_and_leaves_unreadable_and_remote_rows_null(
    tmp_path: Path, mocker: MockerFixture
) -> None:
    """Readable files are measured; missing and S3-hosted ones are counted as skipped, not failed."""
    good = tmp_path / "good.png"
    PILImage.new("RGB", (40, 30)).save(good, format="PNG")
    rows = [_row(1, str(good)), _row(2, str(tmp_path / "missing.png")), _row(3, "https://bucket/x.png"), _row(4, None)]
    session = _session_returning([rows], mocker)
    open_spy = mocker.spy(backfill.PILImage, "open")

    assert await backfill.measure_images_missing_dimensions(session) == (1, 3)

    assert (rows[0].width_px, rows[0].height_px) == (40, 30)
    assert all((row.width_px, row.height_px) == (None, None) for row in rows[1:])
    # The remote and pathless rows never reach Pillow.
    assert open_spy.call_count == 2
    session.commit.assert_awaited_once()


async def test_commits_per_batch_so_an_interrupted_run_keeps_progress(tmp_path: Path, mocker: MockerFixture) -> None:
    """Every batch is committed on its own; the second batch does not depend on the first surviving."""
    good = tmp_path / "good.png"
    PILImage.new("RGB", (8, 8)).save(good, format="PNG")
    session = _session_returning([[_row(1, str(good))], [_row(2, str(good))]], mocker)

    assert await backfill.measure_images_missing_dimensions(session) == (2, 0)

    assert session.commit.await_count == 2


async def test_backfill_is_skipped_on_the_s3_backend(mocker: MockerFixture) -> None:
    """Remote objects have no local header to read, so the run exits without opening a session."""
    mocker.patch.object(backfill.settings, "storage_backend", backfill.StorageBackend.S3)
    session_ctx = mocker.patch.object(backfill, "async_session_context")

    assert await backfill.backfill_image_dimensions() == 0

    session_ctx.assert_not_called()
