"""Main router module."""

from fastapi import APIRouter

from app.api.auth.routers import all_routers as auth_routers
from app.api.background_data.routers.admin import router as background_data_admin_router
from app.api.background_data.routers.public import router as background_data_public_router
from app.api.data_collection.routers import router as data_collection_router
from app.api.newsletter.routers import router as newsletter_backend_router
from app.api.plugins.rpi_cam.routers.main import router as rpi_cam_router

router = APIRouter()

# Include API sub-routers
for r in [
    background_data_admin_router,
    background_data_public_router,
    data_collection_router,
    *auth_routers,
    rpi_cam_router,
    newsletter_backend_router,
]:
    router.include_router(r)
