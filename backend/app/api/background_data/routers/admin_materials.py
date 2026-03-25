"""Admin material routers for background data."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.auth.dependencies import current_active_superuser
from app.api.background_data import crud
from app.api.background_data.models import Material
from app.api.background_data.router_factories import add_basic_admin_crud_routes, add_linked_category_write_routes
from app.api.background_data.schemas import MaterialCreateWithCategories, MaterialRead, MaterialUpdate
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

router = APIRouter(prefix="/materials", tags=["materials"])

add_basic_admin_crud_routes(
    router,
    model_label="material",
    path_param="material_id",
    response_model=MaterialRead,
    create_schema=MaterialCreateWithCategories,
    update_schema=MaterialUpdate,
    create_handler=crud.create_material,
    update_handler=crud.update_material,
    delete_handler=crud.delete_material,
)


add_linked_category_write_routes(
    router,
    parent_path_param="material_id",
    parent_label="material",
    add_categories=crud.add_categories_to_material,
    add_category=crud.add_category_to_material,
    remove_categories=crud.remove_categories_from_material,
)


add_storage_routes(
    router=router,
    parent_api_model_name=Material.get_api_model_name(),
    files_crud=crud.material_files_crud,
    images_crud=crud.material_images_crud,
    include_methods={StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    modify_auth_dep=current_active_superuser,
)
