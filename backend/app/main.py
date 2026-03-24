"""Main application module for the Reverse Engineering Lab - Data collection API.

This module initializes the FastAPI application, sets up the API routes,
and mounts static and upload directories.
"""

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.auth.utils.email_validation import init_email_checker
from app.api.auth.utils.rate_limit import limiter
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.file_mounts import mount_static_directories, register_favicon_route
from app.api.common.routers.health import router as health_router
from app.api.common.routers.main import router
from app.api.common.routers.openapi import init_openapi_docs
from app.api.file_storage.manager import FileCleanupManager
from app.api.file_storage.models.custom_types import ensure_storage_directories
from app.core.cache import init_fastapi_cache
from app.core.config import settings
from app.core.logging import cleanup_logging, setup_logging
from app.core.redis import close_redis, init_redis

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

# Initialize logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Manage application lifespan: startup and shutdown events."""
    # Startup
    logger.info("Starting up application...")
    logger.info(
        "Security config: allowed_hosts=%s allowed_origins=%s cors_origin_regex=%s",
        settings.allowed_hosts,
        settings.allowed_origins,
        settings.cors_origin_regex,
    )

    # Initialize Redis connection and store in app.state
    app.state.redis = await init_redis()

    # Initialize disposable email checker and store in app.state
    app.state.email_checker = await init_email_checker(app.state.redis)

    # Initialize FastAPI Cache
    init_fastapi_cache(app.state.redis)

    # Initialize File Cleanup Manager and store in app.state
    app.state.file_cleanup_manager = FileCleanupManager(async_sessionmaker_factory)
    await app.state.file_cleanup_manager.initialize()

    # Ensure storage directories exist and mark as ready
    ensure_storage_directories()
    app.state.storage_ready = True

    # Mount static file directories and register favicon after storage is ready
    mount_static_directories(app)
    register_favicon_route(app)

    logger.info("Application startup complete")

    yield

    # Shutdown
    logger.info("Shutting down application...")

    # Close email checker (this will cancel background tasks)
    if app.state.email_checker is not None:
        try:
            await app.state.email_checker.close()
        except (RuntimeError, OSError) as e:
            logger.warning("Error closing email checker: %s", e)

    # Close Redis connection
    if app.state.redis is not None:
        try:
            await close_redis(app.state.redis)
        except (ConnectionError, OSError) as e:
            logger.warning("Error closing Redis: %s", e)

    # Close File Cleanup Manager
    if app.state.file_cleanup_manager is not None:
        try:
            await app.state.file_cleanup_manager.close()
        except Exception as e:  # noqa: BLE001
            logger.warning("Error closing file cleanup manager: %s", e)



    logger.info("Application shutdown complete")

    # Clean up logging queues
    await cleanup_logging()


# Initialize FastAPI application with lifespan
app = FastAPI(
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# Add SlowAPI rate limiter state
app.state.limiter = limiter

# Add host header validation middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,  # type: ignore[invalid-argument-type] # Known false positive https://github.com/astral-sh/ty/issues/1635
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
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
