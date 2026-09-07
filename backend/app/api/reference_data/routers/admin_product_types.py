"""Admin product-type routers for reference data."""

from app.api.reference_data.crud.categorized_resources import PRODUCT_TYPE_RESOURCE
from app.api.reference_data.routers.categorized_admin import build_categorized_admin_router
from app.api.reference_data.schemas import (
    ProductTypeCreateWithCategories,
    ProductTypeRead,
    ProductTypeUpdate,
)

router = build_categorized_admin_router(
    prefix="/product-types",
    tag="product-types",
    label="product type",
    id_param="product_type_id",
    spec=PRODUCT_TYPE_RESOURCE,
    create_schema=ProductTypeCreateWithCategories,
    read_schema=ProductTypeRead,
    update_schema=ProductTypeUpdate,
)
