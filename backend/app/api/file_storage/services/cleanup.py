"""Core logic for cleaning up unreferenced files in storage."""

import logging
import time
from pathlib import Path

from anyio import Path as AnyIOPath
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.file_storage.models import File, Image
from app.api.file_storage.parents import registered_media_parents
from app.core.config import settings
from app.core.images import THUMBNAIL_WIDTHS, thumbnail_path_for

logger = logging.getLogger(__name__)


def _path_as_str(path: AnyIOPath) -> str:
    """Typed sort key for AnyIOPath — ``str`` itself is overloaded and confuses the checker."""
    return str(path)


async def _resolve_storage_path(path_like: object) -> AnyIOPath | None:
    """Resolve a StorageFile/StorageImage field to its absolute filesystem path."""
    path_attr = getattr(path_like, "path", None)
    if isinstance(path_attr, str):
        return await AnyIOPath(path_attr).resolve()
    return None


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

    file_stmt = select(File)
    files = (await session.execute(file_stmt)).scalars().all()
    for f in files:
        resolved_path = await _resolve_storage_path(getattr(f, "file", None))
        if resolved_path is not None:
            referenced_paths.add(resolved_path)

    image_stmt = select(Image)
    images = (await session.execute(image_stmt)).scalars().all()
    for img in images:
        resolved_path = await _resolve_storage_path(getattr(img, "file", None))
        if resolved_path is not None:
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


async def report_orphaned_media(session: AsyncSession) -> dict[str, int]:
    """Log a warning for each media table/parent_type whose parent row no longer exists.

    Media parent tables carry ``(parent_type, parent_id)`` with no FK by design:
    a single media row can point at any of several parent tables, which a plain
    FK can't express. The database therefore can't enforce the reference.

    Reporting only — deletion of orphaned media rows (as opposed to orphaned
    files on disk, which `cleanup_unreferenced_files` already handles) is a
    separate, explicit operation.

    Returns:
        Mapping of ``"{table}:{parent_type}"`` to the orphan row count, for
        entries with at least one orphan.
    """
    counts: dict[str, int] = {}
    for media_model in (File, Image):
        for parent_type, parent_model in registered_media_parents().items():
            orphan_stmt = select(func.count()).where(
                media_model.parent_type == parent_type,
                ~select(1).where(parent_model.id == media_model.parent_id).exists(),
            )
            count = (await session.execute(orphan_stmt)).scalar_one()
            if count:
                key = f"{media_model.__tablename__}:{parent_type.value}"
                counts[key] = count
                logger.warning(
                    "Found %d orphaned %s row(s) with parent_type=%s (parent no longer exists)",
                    count,
                    media_model.__tablename__,
                    parent_type.value,
                )
    return counts


async def get_unreferenced_files(session: AsyncSession) -> list[AnyIOPath]:
    """Identify files on disk that are not referenced in the database.

    Returns:
        Sorted list of absolute Paths to unreferenced files.
    """
    referenced = await get_referenced_files(session)
    on_disk = await get_files_on_disk()
    return sorted(on_disk - referenced, key=_path_as_str)


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
