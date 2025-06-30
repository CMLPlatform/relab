"""Main router for camera interaction."""

from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.routers.camera_interaction.images import router as images_router
from app.api.plugins.rpi_cam.routers.camera_interaction.remote_management import router as remote_management_router
from app.api.plugins.rpi_cam.routers.camera_interaction.streams import router as streams_router

router = PublicAPIRouter(prefix="/plugins/rpi-cam/cameras", tags=["rpi-cam-interaction"])

router.include_router(images_router)
router.include_router(streams_router)
router.include_router(remote_management_router)
