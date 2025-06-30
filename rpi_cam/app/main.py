"""Main module for the Raspberry Pi camera streaming application."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dependencies.camera_management import camera_manager, camera_to_standby, check_stream_duration
from app.api.routers.main import router as main_router
from app.core.config import settings
from app.utils.files import cleanup_images, setup_directory

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:  # noqa: ARG001 # 'app' is expected by function signature
    """Lifespan event handler for FastAPI application.

    Note that the camera is set up lazily to avoid unnecessary resource use.
    """
    # Set up temporary directories
    await setup_directory(settings.hls_path)
    await setup_directory(settings.image_path)
    logger.info("Temporary file directories set up")

    # Start recurring cleanup tasks
    await cleanup_images()
    await camera_to_standby()
    await check_stream_duration()
    logger.info("Recurring cleanup tasks started")

    yield

    # Cleanup camera resources
    await camera_manager.cleanup(force=True)
    logger.info("Camera resources cleaned up")


app = FastAPI(
    lifespan=lifespan,
    version="0.1.0",
    title="Raspberry Pi Camera API",
    description="API for Raspberry Pi camera streaming and image capture",
)

# Add CORS middleware to allow requests from the main API host
app.add_middleware(
    CORSMiddleware,
    # Note that CORS origins must not have trailing slashes
    allow_origins=[str(origin).rstrip("/") for origin in settings.allowed_cors_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# Include routers
app.include_router(main_router)
