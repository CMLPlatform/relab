"""Generate missing WebP thumbnails and record that a row's set is complete.

Uploads generate the narrowest width inline and the wider ones in a detached task, so a
restart mid-pass leaves a row with an incomplete set and nothing on disk to distinguish
it from a complete one. Their ``thumbnail_url`` then falls back to the full-size
original, so a list of 80px cards downloads multi-megabyte images.

Selects rows rather than walking the storage directory: the walk cost grew with every
image ever uploaded and ran on every deploy. ``thumbnails_generated_at`` records that a
row's set has been verified, so each run only looks at rows written since the last one.
Rows whose file is missing, unreadable, or on S3 stay unstamped and are logged, so they
are re-tried and re-warned on the next run. Commits per batch, so an interrupted run
resumes where it stopped.

Run with: python -m scripts.maintenance.backfill_thumbnails
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from PIL import Image as PILImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file_storage.crud.support_paths import stored_file_path
from app.api.file_storage.models import Image
from app.core.config import settings
from app.core.config.models import StorageBackend
from app.core.database import async_session_context, close_async_engine
from app.core.images import THUMBNAIL_WIDTHS, generate_thumbnails, thumbnail_path_for
from app.core.logging import setup_logging

if TYPE_CHECKING:
    from pathlib import Path

setup_logging()
logger = logging.getLogger(__name__)

BATCH_SIZE = 500


def _missing_widths(path: Path) -> list[int] | None:
    """Return the thumbnail widths this original should have but does not.

    None when the file cannot be read at all. An empty list means the set is complete —
    including the case of an original narrower than every width, which correctly gets no
    thumbnails because it is already list-sized.
    """
    missing = [width for width in THUMBNAIL_WIDTHS if not thumbnail_path_for(path, width).exists()]
    if not missing:
        return []
    try:
        with PILImage.open(path) as probe:
            original_width = probe.size[0]
    # A missing file, an unreadable one and a decompression bomb all mean the same
    # thing here: nothing can be generated for this row.
    except OSError, ValueError, PILImage.DecompressionBombError:
        return None
    # A width at or above the original is skipped by design, not missing.
    return [width for width in missing if width < original_width]


async def thumbnail_unverified_images(session: AsyncSession) -> tuple[int, int]:
    """Complete and stamp every image row not yet verified. Returns (generated, skipped).

    Works through the rows ``BATCH_SIZE`` at a time, committing after each batch. Rows
    that cannot be read stay unstamped and are excluded from later batches of this run by
    id, so an unreadable file cannot loop the scan forever.
    """
    generated = 0
    skipped: set[object] = set()
    while True:
        stmt = select(Image).where(Image.thumbnails_generated_at.is_(None)).limit(BATCH_SIZE)
        if skipped:
            stmt = stmt.where(Image.id.notin_(skipped))
        rows = (await session.execute(stmt)).scalars().all()
        if not rows:
            break
        for row in rows:
            path = stored_file_path(row)
            missing = _missing_widths(path) if path is not None else None
            if missing is None:
                # A missing, remote or corrupt file must not abort the run; the row stays
                # unstamped and its thumbnail_url falls back to the original.
                logger.warning("Could not thumbnail image %s; leaving it unverified", row.id)
                skipped.add(row.id)
                continue
            if missing:
                generate_thumbnails(path)
                generated += 1
            row.thumbnails_generated_at = datetime.now(UTC)
        await session.commit()

    return generated, len(skipped)


async def _run() -> None:
    """Open a session and complete the pending thumbnail sets."""
    if settings.storage_backend == StorageBackend.S3:
        # Objects live remotely; there is no local file to resize.
        logger.info("Skipping thumbnail backfill: storage backend is S3.")
        return
    try:
        async with async_session_context() as session:
            generated, skipped = await thumbnail_unverified_images(session)
        logger.info("Thumbnail backfill complete: %d images thumbnailed, %d skipped.", generated, skipped)
    finally:
        await close_async_engine()


def main() -> None:
    """Run the backfill script."""
    asyncio.run(_run())
    raise SystemExit(0)


if __name__ == "__main__":
    main()
