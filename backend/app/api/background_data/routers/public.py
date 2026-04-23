"""Public background-data router composition."""

from fastapi import APIRouter

from app.api.background_data.routers.public_categories import router as category_router
from app.api.background_data.routers.public_materials import router as material_router
from app.api.background_data.routers.public_product_types import router as product_type_router
from app.api.background_data.routers.public_support import RecursionDepthQueryParam
from app.api.background_data.routers.public_taxonomies import router as taxonomy_router
from app.api.background_data.routers.public_units import router as unit_router

router = APIRouter()
router.include_router(category_router)
router.include_router(taxonomy_router)
router.include_router(material_router)
router.include_router(product_type_router)
router.include_router(unit_router)

__all__ = ["RecursionDepthQueryParam", "router"]
