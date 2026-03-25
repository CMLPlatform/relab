"""Public material routers for background data."""

from __future__ import annotations

from typing import Annotated

from fastapi_pagination import Page
from pydantic import PositiveInt

from app.api.background_data import crud
from app.api.background_data.dependencies import MaterialFilterWithRelationshipsDep
from app.api.background_data.models import Category, CategoryMaterialLink, Material
from app.api.background_data.router_factories import (
    MaterialIncludeExamples,
    add_linked_category_read_routes,
    relationship_include_query,
)
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, MaterialReadWithRelationships
from app.api.common.crud.associations import get_linked_model_by_id, get_linked_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.read_helpers import get_model_response, list_models_response
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

router = BackgroundDataAPIRouter(prefix="/materials", tags=["materials"])


@router.get(
    "",
    response_model=Page[MaterialReadWithRelationships],
    summary="Get all materials with optional relationships",
)
async def get_materials(
    session: AsyncSessionDep,
    material_filter: MaterialFilterWithRelationshipsDep,
    include: Annotated[set[str] | None, relationship_include_query(openapi_examples=MaterialIncludeExamples)] = None,
) -> Page[Material]:
    """Get all materials with specified relationships."""
    return await list_models_response(
        session,
        Material,
        include_relationships=include,
        model_filter=material_filter,
        read_schema=MaterialReadWithRelationships,
    )


@router.get(
    "/{material_id}",
    response_model=MaterialReadWithRelationships,
)
async def get_material(
    session: AsyncSessionDep,
    material_id: PositiveInt,
    include: Annotated[set[str] | None, relationship_include_query(openapi_examples=MaterialIncludeExamples)] = None,
) -> Material:
    """Get material by ID with specified relationships."""
    return await get_model_response(
        session,
        Material,
        model_id=material_id,
        include_relationships=include,
        read_schema=MaterialReadWithRelationships,
    )


add_linked_category_read_routes(
    router,
    parent_path_param="material_id",
    parent_label="material",
    get_categories=lambda session, parent_id, include, category_filter: get_linked_models(
        session,
        Material,
        parent_id,
        Category,
        CategoryMaterialLink,
        "material_id",
        include_relationships=include,
        model_filter=category_filter,
        read_schema=CategoryRead,
    ),
    get_category=lambda session, parent_id, category_id, include: get_linked_model_by_id(
        session,
        Material,
        parent_id,
        Category,
        category_id,
        CategoryMaterialLink,
        "material_id",
        "category_id",
        include=include,
        read_schema=CategoryRead,
    ),
)


add_storage_routes(
    router=router,
    parent_api_model_name=Material.get_api_model_name(),
    files_crud=crud.material_files_crud,
    images_crud=crud.material_images_crud,
    include_methods={StorageRouteMethod.GET},
)
