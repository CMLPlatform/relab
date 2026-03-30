"""Core logic for cleaning up unreferenced files in storage."""

import logging
import time
from pathlib import Path
from typing import Any, cast

from anyio import Path as AnyIOPath
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.file_storage.models.models import File, Image
from app.core.config import settings
from app.core.images import THUMBNAIL_WIDTHS, thumbnail_path_for

logger = logging.getLogger(__name__)


def _get_thumbnail_paths(image_path: str) -> set[AnyIOPath]:
    """Return the expected thumbnail paths for a stored image."""
    path = Path(image_path)
    return {AnyIOPath(str(thumbnail_path_for(path, width))) for width in THUMBNAIL_WIDTHS}


async def get_referenced_files(session: AsyncSession) -> set[AnyIOPath]:
    """Get all file paths referenced in the database.

    Returns:
        Set of absolute Paths to referenced files.
    """
    referenced_paths: set[AnyIOPath] = set()

    file_stmt = select(cast("Any", File.file))
    files = (await session.exec(file_stmt)).all()
    for f in files:
        if f and hasattr(f, "path"):
            referenced_paths.add(await AnyIOPath(f.path).resolve())

    image_stmt = select(cast("Any", Image.file))
    images = (await session.exec(image_stmt)).all()
    for img in images:
        if img and hasattr(img, "path"):
            resolved_path = await AnyIOPath(img.path).resolve()
            referenced_paths.add(resolved_path)
            referenced_paths.update(_get_thumbnail_paths(str(resolved_path)))

    return referenced_paths


async def get_files_on_disk() -> set[AnyIOPath]:
    """Get all file paths on disk in the upload directories that are old enough to delete.

    Only files older than ``settings.file_cleanup_min_file_age_minutes`` are
    included.  This grace period prevents a Time-of-Check to Time-of-Use race
    where a file has been written to disk but whose database record has not yet committed.

    Returns:
        Set of absolute Paths to eligible files on disk.
    """
    files_on_disk: set[AnyIOPath] = set()
    min_age_seconds = settings.file_cleanup_min_file_age_minutes * 60
    now = time.time()

    for storage_dir in [settings.file_storage_path, settings.image_storage_path]:
        dir_path = AnyIOPath(storage_dir)
        if await dir_path.exists():
            async for path in dir_path.rglob("*"):
                if await path.is_file():
                    stat = await path.stat()
                    if now - stat.st_mtime >= min_age_seconds:
                        files_on_disk.add(await path.resolve())

    return files_on_disk


async def get_unreferenced_files(session: AsyncSession) -> list[AnyIOPath]:
    """Identify files on disk that are not referenced in the database.

    Returns:
        Sorted list of absolute Paths to unreferenced files.
    """
    referenced = await get_referenced_files(session)
    on_disk = await get_files_on_disk()
    return cast("list[AnyIOPath]", sorted(on_disk - referenced, key=str))


async def cleanup_unreferenced_files(session: AsyncSession, *, dry_run: bool = True) -> list[AnyIOPath]:
    """Delete files from disk that are not referenced in the database.

    Args:
        session: AsyncSession to use for database queries.
        dry_run: If True, only log what would be deleted without actually deleting.

    Returns:
        List of Paths that were (or would have been) deleted.
    """
    unreferenced = await get_unreferenced_files(session)

    if not unreferenced:
        logger.info("No unreferenced files found.")
        return []

    if dry_run:
        logger.info("Dry run: Found %d unreferenced files to delete:", len(unreferenced))
        for path in unreferenced:
            logger.info("  [DRY RUN] Would delete: %s", path)
    else:
        logger.info("Cleaning up %d unreferenced files...", len(unreferenced))
        for path in unreferenced:
            try:
                await AnyIOPath(str(path)).unlink()
                logger.info("  Deleted: %s", path)
            except OSError:
                logger.exception("  Failed to delete %s", path)

    return unreferenced
