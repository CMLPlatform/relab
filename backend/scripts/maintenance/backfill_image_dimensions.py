"""Backfill ``width_px``/``height_px`` on Image rows that predate the columns.

Dimensions are recorded at upload from the header the processor already parses,
so only rows written before that landed are NULL. Until this runs, clients get
no aspect ratio for those images and fall back to picking a derivative by width
alone.

Reading is cheap: Pillow's ``open`` parses the header without decoding pixels,
so this is one header read per image rather than a full decode. Rows whose file
is missing or unreadable are left NULL and logged, never failed on.

Run with: python -m scripts.maintenance.backfill_image_dimensions
"""

import asyncio
import logging
from pathlib import Path

from PIL import Image as PILImage
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file_storage.models import Image
from app.core.database import async_session_context, close_async_engine
from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


def _measure(path: str) -> tuple[int, int] | None:
    """Return the image's (width, height), or None when it cannot be read."""
    try:
        with PILImage.open(Path(path)) as img:
            return img.size
    # A missing file, an unreadable one and a decompression bomb all mean the
    # same thing here: no dimensions for this row.
    except OSError, ValueError, PILImage.DecompressionBombError:
        return None


async def measure_images_missing_dimensions(session: AsyncSession) -> tuple[int, int]:
    """Measure every image row still missing a size. Returns (measured, skipped)."""
    measured = 0
    skipped = 0
    rows = (
        (await session.execute(select(Image).where(or_(Image.width_px.is_(None), Image.height_px.is_(None)))))
        .scalars()
        .all()
    )
    logger.info("Found %d image rows without dimensions.", len(rows))
    for row in rows:
        path = getattr(row.file, "path", None)
        size = _measure(str(path)) if path is not None else None
        if size is None:
            # A missing or corrupt file must not abort the run; the row keeps
            # NULL dimensions and clients fall back to width-only picking.
            logger.warning("Could not measure image %s; leaving dimensions unset", row.id)
            skipped += 1
            continue
        row.width_px, row.height_px = size
        measured += 1
    await session.commit()
    return measured, skipped


async def backfill_image_dimensions() -> int:
    """Open a session against the configured database and run the backfill in it."""
    logger.info("Starting image-dimension backfill...")
    try:
        async with async_session_context() as session:
            measured, skipped = await measure_images_missing_dimensions(session)
    finally:
        await close_async_engine()

    logger.info("Image-dimension backfill complete: %d measured, %d skipped.", measured, skipped)
    return 0


def main() -> None:
    """Run the backfill script."""
    raise SystemExit(asyncio.run(backfill_image_dimensions()))


if __name__ == "__main__":
    main()
