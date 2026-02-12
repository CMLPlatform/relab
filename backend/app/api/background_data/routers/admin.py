"""Admin routers for background data models."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Body, Path, Security
from pydantic import PositiveInt

from app.api.auth.dependencies import current_active_superuser
from app.api.background_data import crud
from app.api.background_data.models import (
    Category,
    Material,
    ProductType,
    Taxonomy,
)
from app.api.background_data.schemas import (
    CategoryCreateWithinCategoryWithSubCategories,
    CategoryCreateWithinTaxonomyWithSubCategories,
    CategoryCreateWithSubCategories,
    CategoryRead,
    CategoryUpdate,
    MaterialCreate,
    MaterialCreateWithCategories,
    MaterialRead,
    MaterialUpdate,
    ProductTypeCreateWithCategories,
    ProductTypeRead,
    ProductTypeUpdate,
    TaxonomyCreate,
    TaxonomyCreateWithCategories,
    TaxonomyRead,
    TaxonomyUpdate,
)
from app.api.common.crud.base import get_nested_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

# TODO: Extract common logic and turn into router-factory functions.
# See FileStorageRouterFactory in common/router_factories.py for an example.

# TODO: Improve HTTP method choices for linked resources
# (e.g., POST vs PATCH for adding categories to material, or DELETE vs. PATCH for removing categories)

# TODO: Improve HTTP status codes (e.g., 201 for creation) and error handling.
# TODO: Consider supporting comma-separated list of relationships to include,
# TODO: Add paging and sorting to filters


# Initialize API router
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Security(current_active_superuser)],
)


### Category routers ###
category_router = APIRouter(prefix="/categories", tags=["categories"])


@category_router.post(
    "",
    response_model=CategoryRead,
    summary="Create a new category",
    status_code=201,
)
async def create_category(
    category: Annotated[
        CategoryCreateWithSubCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic category",
                    "description": "Create a category without subcategories",
                    "value": {"name": "Metals", "description": "All kinds of metals", "taxonomy_id": 1},
                },
                "nested": {
                    "summary": "Category with subcategories",
                    "description": "Create a category with nested subcategories",
                    "value": {
                        "name": "Metals",
                        "description": "All kinds of metals",
                        "taxonomy_id": 1,
                        "subcategories": [
                            {
                                "name": "Ferrous metals",
                                "description": "Iron and its alloys",
                                "subcategories": [
                                    {"name": "Steel", "description": "Steel alloys"},
                                ],
                            }
                        ],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Create a new category, optionally with subcategories."""
    return await crud.create_category(session, category)
    # TODO: Figure out how to deduplicate this type of exception handling logic


@category_router.patch("/{category_id}", response_model=CategoryRead, summary="Update category")
async def update_category(
    category_id: PositiveInt,
    category: Annotated[
        CategoryUpdate,
        Body(
            openapi_examples={
                "name": {"summary": "Update name", "value": {"name": "Updated Metal Category"}},
                "description": {
                    "summary": "Update description",
                    "value": {"description": "Updated description for metals category"},
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Update an existing category."""
    return await crud.update_category(session, category_id, category)


@category_router.delete(
    "/{category_id}",
    summary="Delete category",
    status_code=204,
)
async def delete_category(category_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a category by ID, including its subcategories."""
    await crud.delete_category(session, category_id)


## Subcategory routers ##
@category_router.post("/{category_id}/subcategories", response_model=CategoryRead, status_code=201)
async def create_subcategory(
    category_id: PositiveInt,
    category: Annotated[
        CategoryCreateWithinCategoryWithSubCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic subcategory",
                    "description": "Create a subcategory without nested subcategories",
                    "value": {
                        "name": "Ferrous metals",
                        "description": "Iron and its alloys",
                    },
                },
                "nested": {
                    "summary": "Category with subcategories",
                    "description": "Create a subcategory with nested subcategories",
                    "value": {
                        "name": "Ferrous metals",
                        "description": "Iron and its alloys",
                        "subcategories": [
                            {"name": "Steel", "description": "Steel alloys"},
                        ],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Create a new subcategory under an existing category."""
    new_category: Category = await crud.create_category(
        db=session,
        category=category,
        supercategory_id=category_id,
    )

    return new_category


@category_router.delete(
    "/{category_id}/subcategories/{subcategory_id}",
    summary="Delete category",
    status_code=204,
)
async def delete_subcategory(category_id: PositiveInt, subcategory_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a subcategory by ID, including its subcategories."""
    # Validate existence of subcategory
    await get_nested_model_by_id(session, Category, category_id, Category, subcategory_id, "supercategory_id")

    # Delete subcategory
    await crud.delete_category(session, subcategory_id)


### Taxonomy routers ###
taxonomy_router = APIRouter(prefix="/taxonomies", tags=["taxonomies"])


@taxonomy_router.post(
    "",
    response_model=TaxonomyRead,
    summary="Create a new taxonomy",
    status_code=201,
)
async def create_taxonomy(
    taxonomy: Annotated[
        TaxonomyCreate | TaxonomyCreateWithCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic taxonomy",
                    "description": "Create a taxonomy without categories",
                    "value": {
                        "name": "Materials Taxonomy",
                        "description": "Taxonomy for materials",
                        "domains": ["materials"],
                        "source": "DOI:10.2345/12345",
                        "version": "1.0",
                    },
                },
                "nested": {
                    "summary": "Taxonomy with categories",
                    "description": "Create a taxonomy with initial category tree",
                    "value": {
                        "name": "Materials Taxonomy",
                        "description": "Taxonomy for materials",
                        "domains": ["materials"],
                        "source": "DOI:10.2345/12345",
                        "version": "1.0",
                        "categories": [
                            {
                                "name": "Metals",
                                "description": "All kinds of metals",
                                "subcategories": [{"name": "Ferrous metals", "description": "Iron and its alloys"}],
                            }
                        ],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Taxonomy:
    """Create a new taxonomy, optionally with categories."""
    return await crud.create_taxonomy(session, taxonomy)


@taxonomy_router.patch("/{taxonomy_id}", response_model=TaxonomyRead, summary="Update taxonomy")
async def update_taxonomy(
    taxonomy_id: PositiveInt,
    taxonomy: Annotated[
        TaxonomyUpdate,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Update basic info",
                    "value": {"name": "Updated Materials Taxonomy", "description": "Updated taxonomy for materials"},
                },
                "advanced": {
                    "summary": "Update domain and source",
                    "value": {"domains": ["materials"], "source": "https://new-source.com/taxonomy"},
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Taxonomy:
    """Update an existing taxonomy."""
    return await crud.update_taxonomy(session, taxonomy_id, taxonomy)


@taxonomy_router.delete(
    "/{taxonomy_id}",
    summary="Delete taxonomy, including categories",
    status_code=204,
)
async def delete_taxonomy(taxonomy_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a taxonomy by ID, including its categories."""
    await crud.delete_taxonomy(session, taxonomy_id)


## Taxonomy Category routers ##
@taxonomy_router.post(
    "/{taxonomy_id}/categories",
    response_model=CategoryRead,
    summary="Create a new category in a taxonomy",
    status_code=201,
)
async def create_category_in_taxonomy(
    taxonomy_id: PositiveInt,
    category: Annotated[
        CategoryCreateWithinTaxonomyWithSubCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic category",
                    "value": {"name": "Metals", "description": "All kinds of metals"},
                },
                "with_subcategories": {
                    "summary": "Category with subcategories",
                    "value": {
                        "name": "Metals",
                        "description": "All kinds of metals",
                        "subcategories": [{"name": "Steel", "description": "Steel materials"}],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Create a new category in a taxonomy, optionally with subcategories."""
    new_category: Category = await crud.create_category(
        db=session,
        category=category,
        taxonomy_id=taxonomy_id,
    )

    return new_category


@taxonomy_router.delete(
    "/{taxonomy_id}/categories/{category_id}",
    summary="Delete category in a taxonomy",
    status_code=204,
)
async def delete_category_in_taxonomy(
    taxonomy_id: PositiveInt, category_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a category by ID, including its subcategories."""
    # Validate existence of taxonomy and category
    await get_nested_model_by_id(session, Taxonomy, taxonomy_id, Category, category_id, "taxonomy_id")

    # Delete category
    await crud.delete_category(session, category_id)


### Material routers ###

material_router = APIRouter(prefix="/materials", tags=["materials"])


## POST routers ##
@material_router.post(
    "",
    response_model=MaterialRead,
    summary="Create a new material, optionally with category assignments",
    status_code=201,
)
async def create_material(
    material: Annotated[
        MaterialCreate | MaterialCreateWithCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic material",
                    "description": "Create a material without categories",
                    "value": {
                        "name": "Steel",
                        "description": "Common structural steel",
                        "density_kg_m3": 7850,
                        "source": "EN 10025-2",
                        "is_crm": False,
                    },
                },
                "with_categories": {
                    "summary": "Material with categories",
                    "description": "Create a material with category assignments",
                    "value": {
                        "name": "Steel",
                        "description": "Common structural steel",
                        "density_kg_m3": 7850,
                        "source": "EN 10025-2",
                        "is_crm": False,
                        "category_ids": [1, 2],  # e.g., Metals, Ferrous Metals
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Material:
    """Create a new material, optionally with category assignments."""
    return await crud.create_material(session, material)


## PATCH routers ##
@material_router.patch("/{material_id}", response_model=MaterialRead, summary="Update material")
async def update_material(
    material_id: PositiveInt,
    material: Annotated[
        MaterialUpdate,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Update basic info",
                    "value": {"name": "Carbon Steel", "description": "Updated description for steel"},
                },
                "properties": {
                    "summary": "Update properties",
                    "value": {"density_kg_m3": 7870, "source": "Updated standard", "is_crm": True},
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Material:
    """Update an existing material."""
    return await crud.update_material(session, material_id, material)


## DELETE routers ##
@material_router.delete(
    "/{material_id}",
    responses={
        204: {
            "description": "Successfully deleted material",
        },
        404: {"description": "Material not found"},
    },
)
async def delete_material(material_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a material."""
    await crud.delete_material(session, material_id)


## Material Category routers ##
@material_router.post(
    "/{material_id}/categories",
    response_model=list[CategoryRead],
    summary="Add multiple categories to the material",
    status_code=201,
)
async def add_categories_to_material(
    material_id: PositiveInt,
    category_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Category IDs to assign to the material",
            default_factory=set,
            examples=[[1, 2, 3]],
        ),
    ],
    session: AsyncSessionDep,
) -> Sequence[Category]:
    """Add multiple categories to the material."""
    return await crud.add_categories_to_material(session, material_id, category_ids)


@material_router.post(
    "/{material_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Add a category to the material.",
    status_code=201,
)
async def add_category_to_material(
    material_id: PositiveInt,
    category_id: Annotated[
        PositiveInt,
        Path(description="ID of category to add to the material"),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Add a category to the material."""
    return await crud.add_category_to_material(session, material_id, category_id)


@material_router.delete(
    "/{material_id}/categories",
    status_code=204,
    summary="Remove multiple categories from the material",
)
async def remove_categories_from_material_bulk(
    material_id: PositiveInt,
    category_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Category IDs to remove from the material",
            default_factory=set,
            examples=[[1, 2, 3]],
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove multiple categories from the material."""
    await crud.remove_categories_from_material(session, material_id, category_ids)


@material_router.delete(
    "/{material_id}/categories/{category_id}",
    status_code=204,
    summary="Remove a category from the material",
)
async def remove_category_from_material(
    material_id: PositiveInt,
    category_id: Annotated[
        PositiveInt,
        Path(
            description="ID of category to remove from the material",
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove a category from the material."""
    return await crud.remove_categories_from_material(session, material_id, category_id)


## Material Storage routers ##
add_storage_routes(
    router=material_router,
    parent_api_model_name=Material.get_api_model_name(),
    files_crud=crud.material_files_crud,
    images_crud=crud.material_images_crud,
    include_methods={StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    modify_auth_dep=current_active_superuser,  # Only superusers can edit Material files
)

### ProductType routers ###

product_type_router = APIRouter(prefix="/product-types", tags=["product-types"])


## Basic CRUD routers ##
@product_type_router.post("", response_model=ProductTypeRead, summary="Create product type", status_code=201)
async def create_product_type(
    product_type: Annotated[
        ProductTypeCreateWithCategories,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic product type",
                    "description": "Create a product type without categories",
                    "value": {"name": "Smartphone", "description": "Mobile phone with smart capabilities"},
                },
                "with_categories": {
                    "summary": "Product type with categories",
                    "description": "Create a product type and assign it to categories",
                    "value": {
                        "name": "Smartphone",
                        "description": "Mobile phone with smart capabilities",
                        "category_ids": [1, 2],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> ProductType:
    """Create a new product type, optionally assigning it to categories."""
    return await crud.create_product_type(session, product_type)


@product_type_router.patch("/{product_type_id}", response_model=ProductTypeRead, summary="Update product type")
async def update_product_type(
    product_type_id: PositiveInt,
    product_type: Annotated[
        ProductTypeUpdate,
        Body(
            openapi_examples={
                "name": {"summary": "Update name", "value": {"name": "Mobile Phone"}},
                "description": {
                    "summary": "Update description",
                    "value": {"description": "Updated description for mobile phones"},
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> ProductType:
    """Update an existing product type."""
    return await crud.update_product_type(session, product_type_id, product_type)


## DELETE routers ##
@product_type_router.delete(
    "/{product_type_id}",
    responses={
        204: {
            "description": "Successfully deleted product_type",
        },
        404: {"description": "ProductType not found"},
    },
    status_code=204,
)
async def delete_product_type(product_type_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a product type."""
    await crud.delete_product_type(session, product_type_id)


## ProductType Category routers ##
# TODO: deduplicate category routers for materials and product types and move to the common.router_factories module


@product_type_router.post(
    "/{product_type_id}/categories",
    response_model=list[CategoryRead],
    summary="Add multiple categories to the product type",
    status_code=201,
)
async def add_categories_to_product_type_bulk(
    product_type_id: PositiveInt,
    category_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Category IDs to assign to the product type",
            default_factory=set,
            examples=[[1, 2, 3]],
        ),
    ],
    session: AsyncSessionDep,
) -> Sequence[Category]:
    """Add multiple categories to the product type."""
    return await crud.add_categories_to_product_type(session, product_type_id, category_ids)


@product_type_router.post(
    "/{product_type_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Add an existing category to the product type",
    status_code=201,
)
async def add_categories_to_product_type(
    product_type_id: PositiveInt,
    category_id: Annotated[
        PositiveInt,
        Path(description="ID of category to add to the product type"),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Add an existing category to the product type."""
    return await crud.add_category_to_product_type(session, product_type_id, category_id)


@product_type_router.delete(
    "/{product_type_id}/categories",
    status_code=204,
    summary="Remove multiple categories from the product type",
)
async def remove_categories_from_product_type_bulk(
    product_type_id: PositiveInt,
    category_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Category IDs to remove from the product type",
            default_factory=set,
            examples=[[1, 2, 3]],
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove multiple categories from the product type."""
    await crud.remove_categories_from_product_type(session, product_type_id, category_ids)


@product_type_router.delete(
    "/{product_type_id}/categories/{category_id}",
    status_code=204,
    summary="Remove a category from the product type",
)
async def remove_categories_from_product_type(
    product_type_id: PositiveInt,
    category_id: Annotated[
        PositiveInt,
        Path(
            description="ID of category to remove from the product type",
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove a category from the product type."""
    return await crud.remove_categories_from_product_type(session, product_type_id, category_id)


## ProductType Storage routers ##
add_storage_routes(
    router=product_type_router,
    parent_api_model_name=ProductType.get_api_model_name(),
    files_crud=crud.product_type_files,
    images_crud=crud.product_type_images,
    include_methods={StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    modify_auth_dep=current_active_superuser,  # Only superusers can edit ProductType files
)

### Router inclusion ###
router.include_router(category_router)
router.include_router(taxonomy_router)
router.include_router(material_router)
router.include_router(product_type_router)
