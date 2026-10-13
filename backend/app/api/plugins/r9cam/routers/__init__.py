"""Routers for the Raspberry Pi Camera plugin."""

from fastapi import APIRouter

from app.api.plugins.r9cam.constants import LEGACY_PLUGIN_PATH, PLUGIN_PATH
from app.api.plugins.r9cam.routers.admin import router as admin_router
from app.api.plugins.r9cam.routers.camera_crud import device_router as device_crud_router
from app.api.plugins.r9cam.routers.camera_crud import router as public_crud_router
from app.api.plugins.r9cam.routers.camera_interaction import device_router as device_interact_router
from app.api.plugins.r9cam.routers.camera_interaction import router as user_interact_router
from app.api.plugins.r9cam.routers.pairing import device_router as pairing_device_router
from app.api.plugins.r9cam.routers.pairing import router as pairing_router
from app.api.plugins.r9cam.websocket.router import router as ws_router

plugin_router = APIRouter()

plugin_router.include_router(public_crud_router)
plugin_router.include_router(user_interact_router)
plugin_router.include_router(device_crud_router, prefix="/device/cameras")
plugin_router.include_router(device_interact_router)
plugin_router.include_router(pairing_router)
plugin_router.include_router(pairing_device_router)
plugin_router.include_router(ws_router)

router = APIRouter()

for base_path, in_schema in ((PLUGIN_PATH, True), (LEGACY_PLUGIN_PATH, False)):
    router.include_router(plugin_router, prefix=base_path, include_in_schema=in_schema)
    router.include_router(admin_router, prefix=f"/admin{base_path}", include_in_schema=in_schema)
