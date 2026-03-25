"""Admin product-type routers for background data."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.auth.dependencies import current_active_superuser
from app.api.background_data import crud
from app.api.background_data.models import ProductType
from app.api.background_data.router_factories import add_basic_admin_crud_routes, add_linked_category_write_routes
from app.api.background_data.schemas import ProductTypeCreateWithCategories, ProductTypeRead, ProductTypeUpdate
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

router = APIRouter(prefix="/product-types", tags=["product-types"])

add_basic_admin_crud_routes(
    router,
    model_label="product type",
    path_param="product_type_id",
    response_model=ProductTypeRead,
    create_schema=ProductTypeCreateWithCategories,
    update_schema=ProductTypeUpdate,
    create_handler=crud.create_product_type,
    update_handler=crud.update_product_type,
    delete_handler=crud.delete_product_type,
)


add_linked_category_write_routes(
    router,
    parent_path_param="product_type_id",
    parent_label="product type",
    add_categories=crud.add_categories_to_product_type,
    add_category=crud.add_category_to_product_type,
    remove_categories=crud.remove_categories_from_product_type,
)


add_storage_routes(
    router=router,
    parent_api_model_name=ProductType.get_api_model_name(),
    files_crud=crud.product_type_files,
    images_crud=crud.product_type_images,
    include_methods={StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    modify_auth_dep=current_active_superuser,
)
