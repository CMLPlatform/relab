"""Routers for data collection models.

Route modules stay flat and explicit by public resource:

- ``product_read_routers``: base-product reads, component reads, and search/facet endpoints.
- ``product_mutation_routers``: base-product mutations and product-scoped component creation.
- ``product_related_routers``: base-product-only associated resources such as videos/materials.
- ``component_*_routers``: stable component routes and component-scoped associated resources.

Shared route bodies live in small ``*_handlers`` modules so product and component
routers can expose distinct URLs/OpenAPI copy without duplicating CRUD logic.
"""

from fastapi import APIRouter

from app.api.data_collection.routers.component_core_routers import component_core_router
from app.api.data_collection.routers.component_material_routers import component_material_router
from app.api.data_collection.routers.component_media_routers import component_media_router
from app.api.data_collection.routers.product_mutation_routers import product_mutation_router
from app.api.data_collection.routers.product_read_routers import (
    product_read_router,
    user_product_router,
)
from app.api.data_collection.routers.product_related_routers import product_related_router

router = APIRouter()
router.include_router(user_product_router)
router.include_router(product_read_router)
router.include_router(product_mutation_router)
router.include_router(component_core_router)
router.include_router(component_media_router)
router.include_router(component_material_router)
router.include_router(product_related_router)
