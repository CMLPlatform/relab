"""Admin reference-data router composition."""

from typing import Annotated

from fastapi import APIRouter, Path, Security

from app.api.auth.dependencies import current_active_superuser
from app.api.reference_data.routers.admin_categories import router as category_router
from app.api.reference_data.routers.admin_materials import router as material_router
from app.api.reference_data.routers.admin_product_types import router as product_type_router
from app.api.reference_data.routers.admin_taxonomies import router as taxonomy_router
from app.core.cache import clear_cache_namespace
from app.core.config import CacheNamespace

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Security(current_active_superuser)],
)


@router.post("/cache/clear/{namespace}", summary="Clear cache by namespace")
async def clear_cache_by_namespace(
    namespace: Annotated[CacheNamespace, Path(description="Cache namespace to clear")],
) -> dict[str, str]:
    """Clear cached responses for a specific namespace."""
    await clear_cache_namespace(namespace)
    return {"status": "cleared", "namespace": namespace}


router.include_router(category_router)
router.include_router(taxonomy_router)
router.include_router(material_router)
router.include_router(product_type_router)
