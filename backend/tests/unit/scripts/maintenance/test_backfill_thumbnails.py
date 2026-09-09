"""Unit tests for the thumbnail backfill's width detection and per-row error handling.

The row selection and stamping are exercised end to end in
tests/integration/api/test_file_storage_endpoints.py; these cover the decision the
script makes about one file, which is where the "only the narrow width" bug lived, and
that one unusable file cannot take the rest of its batch down with it.
"""

from io import BytesIO
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from PIL import Image as PILImage

from app.core.images import thumbnail_path_for
from scripts.maintenance import backfill_thumbnails
from scripts.maintenance.backfill_thumbnails import _missing_widths

if TYPE_CHECKING:
    from pathlib import Path


def _write_image(path: Path, width: int, height: int) -> None:
    PILImage.new("RGB", (width, height)).save(path, format="PNG")


def _scalar_result(rows: list[object]) -> MagicMock:
    """Stand in for one ``session.execute`` result holding *rows*."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


def test_an_original_with_no_thumbnails_is_missing_every_width_below_it(tmp_path: Path) -> None:
    """The plain backfill case: an image that predates thumbnail generation."""
    original = tmp_path / "bare.png"
    _write_image(original, 2000, 1000)

    assert _missing_widths(original) == [200, 800, 1600]


def test_an_original_that_kept_only_its_narrow_thumbnail_is_still_incomplete(tmp_path: Path) -> None:
    """The state a restart during the upload's detached pass leaves behind.

    The 200px width is generated inline and the wider ones are detached, so a restart
    mid-pass leaves exactly this. Keying the check on the narrow width alone walked
    straight past it, and the gallery then served the full-size original for good.
    """
    stranded = tmp_path / "stranded.png"
    _write_image(stranded, 2000, 1000)
    _write_image(thumbnail_path_for(stranded, 200), 200, 100)

    assert _missing_widths(stranded) == [800, 1600]


def test_a_complete_set_is_not_missing_anything(tmp_path: Path) -> None:
    """A verified row must cost no decode and no regeneration."""
    done = tmp_path / "done.png"
    _write_image(done, 2000, 1000)
    for width in (200, 800, 1600):
        _write_image(thumbnail_path_for(done, width), width, width // 2)

    assert _missing_widths(done) == []


def test_widths_at_or_above_the_original_are_not_missing(tmp_path: Path) -> None:
    """A 300px original legitimately has no 800px thumbnail; that is not a gap to fill."""
    small = tmp_path / "small.png"
    _write_image(small, 300, 200)
    _write_image(thumbnail_path_for(small, 200), 200, 133)

    assert _missing_widths(small) == []


def test_an_unreadable_original_is_reported_as_unknown(tmp_path: Path) -> None:
    """A corrupt file leaves the row unstamped rather than aborting the run."""
    corrupt = tmp_path / "corrupt.png"
    corrupt.write_bytes(b"not an image")

    assert _missing_widths(corrupt) is None


def _write_truncated_jpeg(path: Path, width: int, height: int) -> None:
    """Write a JPEG whose header parses but whose scan data stops halfway.

    Pillow decodes lazily, so ``PILImage.open`` and ``.size`` succeed on this file and
    only the resize hits the missing bytes.
    """
    buffer = BytesIO()
    PILImage.new("RGB", (width, height)).save(buffer, format="JPEG")
    raw = buffer.getvalue()
    path.write_bytes(raw[: len(raw) // 2])


def test_a_header_valid_but_truncated_original_is_reported_as_missing_widths(tmp_path: Path) -> None:
    """The width check parses the header only, so this file looks repairable to it."""
    truncated = tmp_path / "truncated.jpg"
    _write_truncated_jpeg(truncated, 2000, 1000)

    assert _missing_widths(truncated) == [200, 800, 1600]


async def test_a_file_that_fails_mid_resize_is_skipped_and_the_batch_still_commits(tmp_path: Path) -> None:
    """One unreadable pixel stream must not roll back the stamps of the rows around it.

    The batch is committed once per pass, so a raise from the resize would discard every
    ``thumbnails_generated_at`` written before it, leaving the next run to re-select the
    same rows and stall on the same file forever.
    """
    truncated = tmp_path / "truncated.jpg"
    _write_truncated_jpeg(truncated, 2000, 1000)
    healthy = tmp_path / "healthy.png"
    _write_image(healthy, 2000, 1000)

    bad_row = SimpleNamespace(id=uuid4(), thumbnails_generated_at=None)
    good_row = SimpleNamespace(id=uuid4(), thumbnails_generated_at=None)
    paths = {bad_row.id: truncated, good_row.id: healthy}

    session = AsyncMock()
    session.execute.side_effect = [_scalar_result([bad_row, good_row]), _scalar_result([])]

    with patch.object(backfill_thumbnails, "stored_file_path", lambda row: paths[row.id]):
        generated, skipped = await backfill_thumbnails.thumbnail_unverified_images(session)

    assert (generated, skipped) == (1, 1)
    assert bad_row.thumbnails_generated_at is None
    assert good_row.thumbnails_generated_at is not None
    session.commit.assert_awaited()
