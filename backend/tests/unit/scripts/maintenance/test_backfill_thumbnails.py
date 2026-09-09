"""Unit tests for the thumbnail backfill's width detection.

The row selection and stamping are exercised end to end in
tests/integration/api/test_file_storage_endpoints.py; these cover the decision the
script makes about one file, which is where the "only the narrow width" bug lived.
"""

from typing import TYPE_CHECKING

from PIL import Image as PILImage

from app.core.images import thumbnail_path_for
from scripts.maintenance.backfill_thumbnails import _missing_widths

if TYPE_CHECKING:
    from pathlib import Path


def _write_image(path: Path, width: int, height: int) -> None:
    PILImage.new("RGB", (width, height)).save(path, format="PNG")


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
