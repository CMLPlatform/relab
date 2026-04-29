"""Routers for the Raspberry Pi Camera plugin."""

from fastapi import APIRouter

from app.api.plugins.rpi_cam.routers.admin import router as admin_router
from app.api.plugins.rpi_cam.routers.camera_crud import device_router as device_crud_router
from app.api.plugins.rpi_cam.routers.camera_crud import router as public_crud_router
from app.api.plugins.rpi_cam.routers.camera_interaction import device_router as device_interact_router
from app.api.plugins.rpi_cam.routers.camera_interaction import router as user_interact_router
from app.api.plugins.rpi_cam.routers.pairing import router as pairing_router
from app.api.plugins.rpi_cam.websocket.router import router as ws_router

router = APIRouter()

router.include_router(public_crud_router)
router.include_router(user_interact_router)
router.include_router(device_crud_router, prefix="/plugins/rpi-cam/device/cameras")
router.include_router(device_interact_router)
router.include_router(pairing_router)
router.include_router(admin_router)
router.include_router(ws_router)
