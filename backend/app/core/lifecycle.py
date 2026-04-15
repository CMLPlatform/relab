"""Application lifecycle orchestration for runtime services."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from typing import TYPE_CHECKING

import anyio
from fastapi import FastAPI
from httpx import CloseError
from loguru import logger as structured_logger

from app.api.auth.services.email_checker import init_email_checker
from app.api.common.routers.file_mounts import mount_static_directories, register_favicon_route
from app.api.file_storage.services.manager import FileCleanupManager
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager, set_connection_manager
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import set_blocking_redis
from app.core.cache import close_fastapi_cache, init_fastapi_cache
from app.core.clients import create_http_client
from app.core.config import settings
from app.core.database import async_engine, async_sessionmaker_factory
from app.core.observability import init_telemetry, shutdown_telemetry
from app.core.redis import close_redis, init_blocking_redis, init_redis
from app.core.runtime import AppServices, get_app_services, reset_app_services, sync_legacy_state

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)


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


async def _initialize_cache_services(services: AppServices) -> None:
    """Initialize Redis-backed services."""
    services.redis = await init_redis()
    services.email_checker = await init_email_checker(services.redis)
    init_fastapi_cache(services.redis)

    services.blocking_redis = await init_blocking_redis()
    set_blocking_redis(services.blocking_redis)


async def _initialize_camera_services(services: AppServices) -> None:
    """Initialize in-process camera connection services."""
    services.camera_connection_manager = CameraConnectionManager()
    set_connection_manager(services.camera_connection_manager)


async def _initialize_storage_services(app: FastAPI, services: AppServices) -> None:
    """Initialize file storage and cleanup services."""
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
    await _initialize_cache_services(services)
    await _initialize_camera_services(services)
    await _initialize_storage_services(app, services)
    _initialize_http_and_observability(app, services)
    sync_legacy_state(app, services)
    structured_logger.info("Application services initialized")
    return services


async def _shutdown_email_checker(services: AppServices) -> None:
    if services.email_checker is not None:
        try:
            await services.email_checker.close()
        except (RuntimeError, OSError) as e:
            logger.warning("Error closing email checker: %s", e)


async def _close_redis_client(redis_client: Redis | None, label: str) -> None:
    if redis_client is None:
        return
    try:
        await close_redis(redis_client)
    except (ConnectionError, OSError) as e:
        logger.warning("Error closing %s Redis client: %s", label, e)


async def _shutdown_cache_services(services: AppServices) -> None:
    await _close_redis_client(services.redis, "primary")
    await _close_redis_client(services.blocking_redis, "blocking")

    try:
        await close_fastapi_cache()
    except RuntimeError as e:
        logger.warning("Error closing endpoint cache: %s", e)


async def _shutdown_file_cleanup_manager(services: AppServices) -> None:
    if services.file_cleanup_manager is not None:
        try:
            await services.file_cleanup_manager.close()
        except asyncio.CancelledError as e:
            logger.warning("Error closing file cleanup manager: %s", e)


async def _shutdown_http_client(services: AppServices) -> None:
    if services.http_client is not None:
        try:
            await services.http_client.aclose()
        except CloseError as e:
            logger.warning("Error closing outbound HTTP client: %s", e)


async def shutdown_runtime_services(app: FastAPI) -> None:
    """Shutdown and clear all runtime services."""
    services = get_app_services(app)
    await _shutdown_email_checker(services)
    await _shutdown_cache_services(services)
    await _shutdown_file_cleanup_manager(services)
    await _shutdown_http_client(services)
    shutdown_telemetry(app)
    services.telemetry_enabled = False
    reset_app_services(app)
