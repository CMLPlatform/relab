"""Main application module for the Reverse Engineering Lab - Data collection API.

This module initializes the FastAPI application, sets up the API routes,
and mounts static and upload directories.
"""

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination

from app.api.auth.utils.email_validation import EmailChecker
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.main import router
from app.api.common.routers.openapi import init_openapi_docs
from app.core.config import settings
from app.core.logging import setup_logging
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

    # Initialize Redis connection and store in app.state
    # The init_redis() function will verify the connection on startup and return None if it fails
    app.state.redis = await init_redis()

    # Initialize disposable email checker and store in app.state
    app.state.email_checker = None
    try:
        email_checker = EmailChecker(app.state.redis)
        await email_checker.initialize()
        app.state.email_checker = email_checker
    except (RuntimeError, ValueError, ConnectionError) as e:
        logger.warning("Failed to initialize email checker: %s", e)

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

    logger.info("Application shutdown complete")


# Initialize FastAPI application with lifespan
app = FastAPI(
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Include main API routes
app.include_router(router)

# Initialize OpenAPI documentation
init_openapi_docs(app)

# Mount local file storage
app.mount("/uploads", StaticFiles(directory=settings.uploads_path), name="uploads")
app.mount("/static", StaticFiles(directory=settings.static_files_path), name="static")

# Initialize exception handling
register_exception_handlers(app)

# Add pagination
add_pagination(app)
