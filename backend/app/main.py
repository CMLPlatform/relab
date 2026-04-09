"""Main application module for the Reverse Engineering Lab - Data collection API.

This module initializes the FastAPI application, sets up the API routes,
and mounts static and upload directories.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import anyio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
from httpx import CloseError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.auth.services.email_checker import init_email_checker
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.file_mounts import mount_static_directories, register_favicon_route
from app.api.common.routers.health import router as health_router
from app.api.common.routers.main import router
from app.api.common.routers.openapi import init_openapi_docs
from app.api.file_storage.services.manager import FileCleanupManager
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager, set_connection_manager
from app.core.cache import close_fastapi_cache, init_fastapi_cache
from app.core.clients import create_http_client
from app.core.config import settings
from app.core.database import async_engine, async_sessionmaker_factory
from app.core.logging import cleanup_logging, setup_logging
from app.core.middleware import register_request_id_middleware, register_request_size_limit_middleware
from app.core.observability import init_telemetry, shutdown_telemetry
from app.core.redis import close_redis, init_redis

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

# Initialize logging
setup_logging()
logger = logging.getLogger(__name__)


def ensure_storage_directories() -> None:
    """Create configured storage directories before mounting them."""
    for path in [settings.file_storage_path, settings.image_storage_path]:
        path.mkdir(parents=True, exist_ok=True)


def log_startup_configuration() -> None:
    """Log key startup configuration values."""
    logger.info("Starting up application...")
    logger.info(
        "Security config: allowed_hosts=%s allowed_origins=%s cors_origin_regex=%s",
        settings.allowed_hosts,
        settings.allowed_origins,
        settings.cors_origin_regex,
    )


async def initialize_app_state(app: FastAPI) -> None:
    """Initialize shared app state and background services."""
    app.state.redis = await init_redis()
    app.state.email_checker = await init_email_checker(app.state.redis)
    init_fastapi_cache(app.state.redis)

    camera_manager = CameraConnectionManager()
    app.state.camera_connection_manager = camera_manager
    set_connection_manager(camera_manager)

    app.state.file_cleanup_manager = FileCleanupManager(async_sessionmaker_factory)
    await app.state.file_cleanup_manager.initialize()

    ensure_storage_directories()
    app.state.storage_ready = True
    mount_static_directories(app)
    register_favicon_route(app)

    app.state.http_client = create_http_client()
    app.state.image_resize_limiter = anyio.CapacityLimiter(settings.image_resize_workers)
    init_telemetry(app, async_engine)


async def shutdown_email_checker(app: FastAPI) -> None:
    """Close the disposable email checker if it was initialized."""
    if app.state.email_checker is not None:
        try:
            await app.state.email_checker.close()
        except (RuntimeError, OSError) as e:
            logger.warning("Error closing email checker: %s", e)


async def shutdown_redis_and_cache(app: FastAPI) -> None:
    """Close Redis and the endpoint cache backend."""
    if app.state.redis is not None:
        try:
            await close_redis(app.state.redis)
        except (ConnectionError, OSError) as e:
            logger.warning("Error closing Redis: %s", e)

    try:
        await close_fastapi_cache()
    except RuntimeError as e:
        logger.warning("Error closing endpoint cache: %s", e)


async def shutdown_file_cleanup_manager(app: FastAPI) -> None:
    """Close the file cleanup manager if it was initialized."""
    if app.state.file_cleanup_manager is not None:
        try:
            await app.state.file_cleanup_manager.close()
        except asyncio.CancelledError as e:
            logger.warning("Error closing file cleanup manager: %s", e)


async def shutdown_http_client(app: FastAPI) -> None:
    """Close the shared outbound HTTP client if present."""
    if getattr(app.state, "http_client", None) is not None:
        try:
            await app.state.http_client.aclose()
        except CloseError as e:
            logger.warning("Error closing outbound HTTP client: %s", e)


def shutdown_app_telemetry(app: FastAPI) -> None:
    """Shutdown optional telemetry instrumentation."""
    try:
        shutdown_telemetry(app)
    except RuntimeError as e:
        logger.warning("Error shutting down telemetry: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Manage application lifespan: startup and shutdown events."""
    log_startup_configuration()
    await initialize_app_state(app)
    logger.info("Application startup complete")

    yield

    logger.info("Shutting down application...")
    await shutdown_email_checker(app)
    await shutdown_redis_and_cache(app)
    await shutdown_file_cleanup_manager(app)
    await shutdown_http_client(app)
    shutdown_app_telemetry(app)
    logger.info("Application shutdown complete")
    await cleanup_logging()


# Initialize FastAPI application with lifespan
app = FastAPI(
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# Add request ID propagation and request access logging
register_request_id_middleware(app)

# Add global non-multipart request body size limits
register_request_size_limit_middleware(app)

# Add host header validation middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

# Include health check routes (liveness and readiness probes)
app.include_router(health_router)

# Include main API routes
app.include_router(router)

# Initialize OpenAPI documentation
init_openapi_docs(app)

# Initialize exception handling
register_exception_handlers(app)

# Add pagination
add_pagination(app)
