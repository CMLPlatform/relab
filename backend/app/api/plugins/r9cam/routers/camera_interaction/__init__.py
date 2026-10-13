"""Main router for camera interaction."""

from app.api.common.audiences import DeviceAPIRouter, PublicAPIRouter
from app.api.plugins.r9cam.routers.camera_interaction.hls import router as hls_router
from app.api.plugins.r9cam.routers.camera_interaction.images import device_router as device_images_router
from app.api.plugins.r9cam.routers.camera_interaction.images import router as images_router
from app.api.plugins.r9cam.routers.camera_interaction.streams import router as streams_router
from app.api.plugins.r9cam.routers.camera_interaction.telemetry import router as telemetry_router

router = PublicAPIRouter(prefix="/cameras", tags=["r9cam-interaction"])

router.include_router(images_router)
router.include_router(streams_router)
router.include_router(telemetry_router)
router.include_router(hls_router)

device_router = DeviceAPIRouter(prefix="/device/cameras", tags=["r9cam-device"])
device_router.include_router(device_images_router)
