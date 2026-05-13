"""Application lifecycle orchestration for runtime services."""

from __future__ import annotations

import asyncio
import importlib
import inspect
import logging
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING

import anyio
from fastapi import FastAPI
from httpx import CloseError

from app.api.auth.services.common_password_checker import init_common_password_checker
from app.api.auth.services.email_checker import init_email_checker
from app.api.common.routers.file_mounts import mount_static_directories, register_favicon_route
from app.api.file_storage.services.manager import FileCleanupManager
from app.api.file_storage.upload_security import validate_malware_scanner_configuration
from app.api.plugins.rpi_cam.websocket.runtime_state import set_blocking_redis, set_connection_manager
from app.core.cache import close_cache, init_cache
from app.core.clients import create_http_client
from app.core.config import Environment, settings
from app.core.database import async_engine, async_sessionmaker_factory
from app.core.logging import cleanup_logging, setup_logging
from app.core.observability import init_telemetry, shutdown_telemetry
from app.core.redis import close_redis, init_redis
from app.core.runtime import AppServices, get_app_services, reset_app_services

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Awaitable, Callable

    from redis.asyncio import Redis

    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    ShutdownClose = Callable[[], Awaitable[None] | None]


@dataclass(frozen=True, slots=True)
class ShutdownStep:
    """One runtime cleanup action and the failures it may tolerate."""

    label: str
    close: ShutdownClose | None
    expected_errors: tuple[type[BaseException], ...] = ()


def log_startup_configuration() -> None:
    """Log key startup configuration values."""
    logger.info("Starting up application...")
    logger.info(
        "Security config: allowed_hosts=%s allowed_origins=%s cors_origin_regex=%s",
        settings.allowed_hosts,
        settings.allowed_origins,
        settings.cors_origin_regex,
    )


def ensure_storage_directories() -> None:
    """Create configured storage directories and verify they are writable."""
    for path in [settings.file_storage_path, settings.image_storage_path]:
        path.mkdir(parents=True, exist_ok=True)
        try:
            with tempfile.NamedTemporaryFile(dir=path, prefix=".write-test-", delete=True):
                pass
        except OSError as e:
            msg = f"Storage path is not writable: {path}"
            raise RuntimeError(msg) from e


def create_camera_connection_manager() -> CameraConnectionManager:
    """Create the camera connection manager when runtime services start."""
    module = importlib.import_module("app.api.plugins.rpi_cam.websocket.connection_manager")

    return module.CameraConnectionManager()


async def _initialize_cache_services(services: AppServices) -> None:
    """Initialize Redis-backed services."""
    services.redis = await init_redis()
    services.email_checker = await init_email_checker(services.redis)
    services.common_password_checker = await init_common_password_checker(services.redis)
    init_cache(services.redis)

    services.blocking_redis = await init_redis(blocking=True)
    set_blocking_redis(services.blocking_redis)


async def _initialize_camera_services(services: AppServices) -> None:
    """Initialize in-process camera connection services."""
    services.camera_connection_manager = create_camera_connection_manager()
    set_connection_manager(services.camera_connection_manager)


async def _initialize_storage_services(app: FastAPI, services: AppServices) -> None:
    """Initialize file storage and cleanup services."""
    validate_malware_scanner_configuration()
    services.file_cleanup_manager = FileCleanupManager(async_sessionmaker_factory)
    await services.file_cleanup_manager.initialize()

    ensure_storage_directories()
    services.storage_ready = True
    mount_static_directories(app)
    register_favicon_route(app)


def _initialize_http_and_observability(app: FastAPI, services: AppServices) -> None:
    """Initialize shared HTTP and observability services."""
    services.http_client = create_http_client()
    services.image_resize_limiter = anyio.CapacityLimiter(settings.image_resize_workers)
    services.telemetry_enabled = init_telemetry(app, async_engine)


async def initialize_runtime_services(app: FastAPI) -> AppServices:
    """Create and initialize all long-lived runtime services."""
    services = reset_app_services(app)
    try:
        await _initialize_cache_services(services)
        await _initialize_camera_services(services)
        await _initialize_storage_services(app, services)
        _initialize_http_and_observability(app, services)
    except BaseException:
        await shutdown_runtime_services(app, raise_unexpected=False)
        raise
    else:
        logger.info("Application services initialized")
        return services


async def _close_redis_client(redis_client: Redis | None) -> None:
    if redis_client is None:
        return
    await close_redis(redis_client)


async def _run_shutdown_step(
    step: ShutdownStep,
) -> BaseException | None:
    """Run one shutdown step and return unexpected failures after logging them."""
    if step.close is None:
        return None
    try:
        result = step.close()
        if inspect.isawaitable(result):
            await result
    except step.expected_errors as e:
        logger.warning("Error closing %s: %s", step.label, e)
    except BaseException as e:
        logger.exception("Unexpected error closing %s", step.label)
        return e
    return None


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:
    """Return runtime cleanup steps in shutdown order."""
    return (
        ShutdownStep(
            label="email checker",
            close=services.email_checker.close if services.email_checker is not None else None,
            expected_errors=(RuntimeError, OSError),
        ),
        ShutdownStep(
            label="primary Redis client",
            close=lambda: _close_redis_client(services.redis),
            expected_errors=(ConnectionError, OSError),
        ),
        ShutdownStep(
            label="blocking Redis client",
            close=lambda: _close_redis_client(services.blocking_redis),
            expected_errors=(ConnectionError, OSError),
        ),
        ShutdownStep(
            label="endpoint cache",
            close=close_cache,
            expected_errors=(RuntimeError,),
        ),
        ShutdownStep(
            label="file cleanup manager",
            close=services.file_cleanup_manager.close if services.file_cleanup_manager is not None else None,
            expected_errors=(asyncio.CancelledError,),
        ),
        ShutdownStep(
            label="outbound HTTP client",
            close=services.http_client.aclose if services.http_client is not None else None,
            expected_errors=(CloseError,),
        ),
        ShutdownStep(label="telemetry", close=lambda: shutdown_telemetry(app)),
    )


async def shutdown_runtime_services(app: FastAPI, *, raise_unexpected: bool = True) -> None:
    """Shutdown and clear all runtime services."""
    services = get_app_services(app)
    unexpected_errors: list[BaseException] = []
    try:
        for step in _shutdown_steps(app, services):
            if error := await _run_shutdown_step(step):
                unexpected_errors.extend([error])
        services.telemetry_enabled = False
    finally:
        set_blocking_redis(None)
        set_connection_manager(None)
        reset_app_services(app)
    if unexpected_errors and raise_unexpected:
        raise unexpected_errors[0]


@asynccontextmanager
async def runtime_lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Manage application startup and shutdown for the FastAPI lifespan."""
    logging_configured = False
    startup_complete = False

    try:
        if settings.environment != Environment.TESTING:
            setup_logging()
            logging_configured = True

        log_startup_configuration()
        await initialize_runtime_services(app)
        startup_complete = True
        logger.info("Application startup complete")
        yield
    finally:
        try:
            if startup_complete:
                logger.info("Shutting down application...")
                await shutdown_runtime_services(app)
                logger.info("Application shutdown complete")
        finally:
            if logging_configured:
                await cleanup_logging()
