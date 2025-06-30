"""Routers for the Raspberry Pi Camera plugin."""

from fastapi import APIRouter

from app.api.plugins.rpi_cam.routers.admin import router as admin_router
from app.api.plugins.rpi_cam.routers.camera_crud import router as public_crud_router
from app.api.plugins.rpi_cam.routers.camera_interaction.main import router as user_interact_router

router = APIRouter()

router.include_router(public_crud_router)
router.include_router(user_interact_router)
router.include_router(admin_router)
