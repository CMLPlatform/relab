"""Main router for the Raspberry Pi camera API."""

from fastapi import APIRouter, Security

from app.api.dependencies.auth import verify_request
from app.api.routers.camera import router as camera_router
from app.api.routers.images import router as images_router
from app.api.routers.stream import router as stream_router

# Set up API key verification for the main router
router = APIRouter(dependencies=[Security(verify_request)])

router.include_router(camera_router)
router.include_router(images_router)
router.include_router(stream_router)
