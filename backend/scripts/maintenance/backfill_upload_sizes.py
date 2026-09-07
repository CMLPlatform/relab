"""Backfill ``upload_size_bytes`` on existing File and Image rows from stored objects.

Files uploaded before the quota ledger count as zero bytes until this runs. Run it
once after upgrading to the ledger release, before turning byte limits on.

Stats each object through the configured backend (filesystem or S3), writes the real
size, then rebuilds the per-user totals.

Run with: python -m scripts.maintenance.backfill_upload_sizes
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.models.product import Product
from app.api.file_storage.models import File, Image
from app.api.file_storage.upload_quota import recompute_user_upload_quota
from app.core.database import async_session_context, close_async_engine
from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


async def _backfill_model_sizes(session: AsyncSession, model: type[File | Image]) -> int:
    """Set ``upload_size_bytes`` from the stored object size for every row of *model*."""
    updated = 0
    rows = (await session.execute(select(model))).scalars().all()
    for row in rows:
        try:
            # StorageFile.size delegates to the configured backend (filesystem or S3).
            size = row.file.size
        except Exception:
            # A missing object must not abort the whole backfill.
            logger.exception("Could not size %s %s; leaving upload_size_bytes unchanged", model.__name__, row.id)
            continue
        if row.upload_size_bytes != size:
            row.upload_size_bytes = size
            updated += 1
    return updated


async def backfill_upload_sizes() -> int:
    """Backfill media sizes, then rebuild each affected user's quota ledger."""
    logger.info("Starting upload-size backfill...")
    try:
        async with async_session_context() as session:
            file_updates = await _backfill_model_sizes(session, File)
            image_updates = await _backfill_model_sizes(session, Image)
            await session.commit()
            logger.info("Sized %d file rows and %d image rows.", file_updates, image_updates)

            # Rebuild the ledger for every product owner; recompute is idempotent and sets 0
            # for an owner with no media.
            owner_ids = {
                row[0]
                for row in (await session.execute(select(Product.owner_id).distinct())).all()
                if row[0] is not None
            }
            for owner_id in owner_ids:
                await recompute_user_upload_quota(session, user_id=owner_id)
            await session.commit()
            logger.info("Rebuilt upload quota ledger for %d users.", len(owner_ids))
    finally:
        await close_async_engine()

    logger.info("Upload-size backfill complete.")
    return 0


def main() -> None:
    """Run the backfill script."""
    raise SystemExit(asyncio.run(backfill_upload_sizes()))


if __name__ == "__main__":
    main()
