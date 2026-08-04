"""File-storage runtime lifecycle, wired into the app in the composition root (main.py)."""

import asyncio
from typing import TYPE_CHECKING

from app.api.file_storage.services.manager import FileCleanupManager
from app.api.file_storage.upload_security import probe_malware_scanner, validate_malware_scanner_configuration
from app.core.database import async_sessionmaker_factory
from app.core.lifecycle import DomainLifecycle, ShutdownStep

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.runtime import AppServices


async def _startup(app: FastAPI, services: AppServices) -> None:  # noqa: ARG001
    validate_malware_scanner_configuration()
    await probe_malware_scanner()
    services.file_cleanup_manager = FileCleanupManager(async_sessionmaker_factory)
    await services.file_cleanup_manager.initialize()


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:  # noqa: ARG001
    return (
        ShutdownStep(
            label="file cleanup manager",
            close=services.file_cleanup_manager.close if services.file_cleanup_manager is not None else None,
            expected_errors=(asyncio.CancelledError,),
        ),
    )


FILE_STORAGE_LIFECYCLE = DomainLifecycle(name="file_storage", startup=_startup, shutdown_steps=_shutdown_steps)
