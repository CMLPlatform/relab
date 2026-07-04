"""Admin material routers for reference data."""

from app.api.reference_data.crud.categorized_resources import MATERIAL_RESOURCE
from app.api.reference_data.routers.categorized_admin import build_categorized_admin_router
from app.api.reference_data.schemas import MaterialCreateWithCategories, MaterialRead, MaterialUpdate

router = build_categorized_admin_router(
    prefix="/materials",
    tag="materials",
    label="material",
    id_param="material_id",
    spec=MATERIAL_RESOURCE,
    create_schema=MaterialCreateWithCategories,
    read_schema=MaterialRead,
    update_schema=MaterialUpdate,
)
