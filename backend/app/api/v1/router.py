"""Top-level v1 API router composition."""

from fastapi import APIRouter

from app.api.common.routers.main import router as api_router

router = APIRouter(prefix="/v1")
router.include_router(api_router)
