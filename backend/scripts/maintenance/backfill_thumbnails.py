"""Generate missing WebP thumbnails for images that predate thumbnail generation.

Uploads have generated thumbnails since ``generate_thumbnails`` was wired into the
create flow, but older files, and any upload whose generation step failed (it is
logged and swallowed so a bad encode cannot fail the upload), have none. Their
``thumbnail_url`` then falls back to the full-size original, so a list of 80px
cards downloads multi-megabyte images.

Walks the image storage directory rather than the Image table: the thumbnail path
is derived from the filename, so the files are the whole story. Idempotent — an
image with its smallest thumbnail already on disk is skipped.

Run with: python -m scripts.maintenance.backfill_thumbnails
"""

import logging
from typing import TYPE_CHECKING

from app.core.config import settings
from app.core.config.models import StorageBackend
from app.core.images import THUMBNAIL_INFIX, THUMBNAIL_WIDTHS, generate_thumbnails, thumbnail_path_for
from app.core.logging import setup_logging

if TYPE_CHECKING:
    from pathlib import Path

setup_logging()
logger = logging.getLogger(__name__)

SMALLEST_WIDTH = min(THUMBNAIL_WIDTHS)


def _needs_thumbnails(path: Path) -> bool:
    """Return whether this is an original still missing its smallest thumbnail."""
    if not path.is_file() or THUMBNAIL_INFIX in path.stem:
        return False
    return not thumbnail_path_for(path, SMALLEST_WIDTH).exists()


def backfill_thumbnails() -> int:
    """Generate thumbnails for every stored original that has none."""
    if settings.storage_backend == StorageBackend.S3:
        # Objects live remotely; there is no local file to resize.
        logger.info("Skipping thumbnail backfill: storage backend is S3.")
        return 0

    generated = 0
    skipped = 0
    for path in sorted(settings.image_storage_path.iterdir()):
        if not _needs_thumbnails(path):
            continue
        try:
            written = generate_thumbnails(path)
        # A corrupt or unreadable file must not abort the run; it keeps falling back
        # to the original and is re-tried, and re-logged, on the next deploy.
        except OSError, ValueError:
            logger.warning("Could not thumbnail %s; leaving it without one", path.name, exc_info=True)
            skipped += 1
            continue
        # An original narrower than the smallest width gets no thumbnail by design,
        # and needs none: it is already list-sized.
        if written:
            generated += 1

    logger.info("Thumbnail backfill complete: %d images thumbnailed, %d skipped.", generated, skipped)
    return 0


def main() -> None:
    """Run the backfill script."""
    raise SystemExit(backfill_thumbnails())


if __name__ == "__main__":
    main()
