"""Periodic background task for cleaning up unreferenced files."""

import logging
from typing import TYPE_CHECKING

from app.api.file_storage.services.cleanup import cleanup_unreferenced_files
from app.core.background_tasks import PeriodicBackgroundTask
from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


class FileCleanupManager(PeriodicBackgroundTask):
    """Periodic background task that deletes unreferenced files from storage."""

    def __init__(self, session_factory: Callable[[], AsyncSession]) -> None:
        super().__init__(interval_seconds=settings.file_cleanup_interval_hours * 3600)
        self.session_factory = session_factory

    async def initialize(self) -> None:
        """Start the periodic cleanup task, unless cleanup is disabled in settings."""
        if not settings.file_cleanup_enabled:
            logger.info("File cleanup is disabled (FILE_CLEANUP_ENABLED=false), skipping.")
            return
        logger.info("Initializing FileCleanupManager background task...")
        await super().initialize()

    async def run_once(self) -> None:
        """Run one cleanup pass, deleting unreferenced files from storage."""
        logger.info("Starting scheduled background file cleanup...")
        async with self.session_factory() as session:
            await cleanup_unreferenced_files(session, dry_run=settings.file_cleanup_dry_run)
        logger.info("Finished scheduled background file cleanup.")
