"""File-storage runtime lifecycle, wired into the app in the composition root (main.py)."""

import asyncio
from typing import TYPE_CHECKING, cast

from app.api.file_storage.services.manager import FileCleanupManager
from app.api.file_storage.upload_security import probe_malware_scanner, validate_malware_scanner_configuration
from app.core.database import async_sessionmaker_factory
from app.core.lifecycle import DomainLifecycle, ShutdownStep

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.runtime import AppServices

# file_storage owns this runtime service; it lives in AppServices.extras so core
# needs no import of it.
CLEANUP_MANAGER_KEY = "file_storage.cleanup_manager"


def cleanup_manager_from(services: AppServices) -> FileCleanupManager | None:
    """Return the shared file cleanup manager from the runtime services."""
    return cast("FileCleanupManager | None", services.extras.get(CLEANUP_MANAGER_KEY))


async def _startup(app: FastAPI, services: AppServices) -> None:  # noqa: ARG001
    validate_malware_scanner_configuration()
    await probe_malware_scanner()
    manager = FileCleanupManager(async_sessionmaker_factory)
    services.extras[CLEANUP_MANAGER_KEY] = manager
    await manager.initialize()


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:  # noqa: ARG001
    manager = cleanup_manager_from(services)
    return (
        ShutdownStep(
            label="file cleanup manager",
            close=manager.close if manager is not None else None,
            expected_errors=(asyncio.CancelledError,),
        ),
    )


FILE_STORAGE_LIFECYCLE = DomainLifecycle(name="file_storage", startup=_startup, shutdown_steps=_shutdown_steps)
