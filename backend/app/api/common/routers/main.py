"""Main router module."""

from fastapi import APIRouter

from app.api.auth.routers import all_routers as auth_routers
from app.api.data_collection.routers import router as data_collection_router
from app.api.file_storage.routers import router as file_storage_router
from app.api.plugins.rpi_cam.routers import router as rpi_cam_router
from app.api.reference_data.routers.admin import router as reference_data_admin_router
from app.api.reference_data.routers.public import router as reference_data_public_router

router = APIRouter()

# Include API sub-routers
for r in [
    reference_data_admin_router,
    reference_data_public_router,
    data_collection_router,
    file_storage_router,
    *auth_routers,
    rpi_cam_router,
]:
    router.include_router(r)
