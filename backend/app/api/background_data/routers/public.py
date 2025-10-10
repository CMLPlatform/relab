"""Admin routers for background data models."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import PositiveInt
from sqlmodel import select

from app.api.background_data import crud
from app.api.background_data.dependencies import (
    CategoryFilterDep,
    CategoryFilterWithRelationshipsDep,
    MaterialFilterWithRelationshipsDep,
    ProductTypeFilterWithRelationshipsDep,
    TaxonomyFilterDep,
)
from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
)
from app.api.background_data.schemas import (
    CategoryRead,
    CategoryReadAsSubCategoryWithRecursiveSubCategories,
    CategoryReadWithRecursiveSubCategories,
    CategoryReadWithRelationshipsAndFlatSubCategories,
    MaterialReadWithRelationships,
    ProductTypeReadWithRelationships,
    TaxonomyRead,
)
from app.api.common.crud.associations import get_linked_model_by_id, get_linked_models
from app.api.common.crud.base import get_model_by_id, get_models, get_nested_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

# TODO: Extract common logic and turn into router-factory functions.
# See FileStorageRouterFactory in common/router_factories.py for an example.

# TODO: Improve HTTP method choices for linked resources
# (e.g., POST vs PATCH for adding categories to material, or DELETE vs. PATCH for removing categories)

# TODO: Improve HTTP status codes (e.g., 201 for creation) and error handling.
# TODO: Consider supporting comma-separated list of relationships to include,
# TODO: Add paging and sorting to filters


# Initialize API router
router = APIRouter()

### Category routers ###
category_router = PublicAPIRouter(prefix="/categories", tags=["categories"])


## Utilities ##
def convert_subcategories_to_read_model(
    subcategories: list[Category], max_depth: int = 1, current_depth: int = 0
) -> list[CategoryReadAsSubCategoryWithRecursiveSubCategories]:
    """Convert subcategories to read model recursively."""
    if current_depth >= max_depth:
        return []

    return [
        CategoryReadAsSubCategoryWithRecursiveSubCategories.model_validate(
            category,
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth, current_depth + 1
                )
            },
        )
        for category in subcategories
    ]


RecursionDepthQueryParam = Annotated[int, Query(ge=1, le=5, description="Maximum recursion depth")]


## GET routers ##
@category_router.get(
    "",
    response_model=list[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get all categories with optional filtering and relationships",
    responses={
        200: {
            "description": "List of categories",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic categories",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Metals",
                                    "description": "All metals",
                                    "materials": [],
                                    "product_types": [],
                                    "subcategories": [],
                                }
                            ],
                        },
                        "with_relationships": {
                            "summary": "With relationships",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Metals",
                                    "materials": [{"id": 1, "name": "Steel"}],
                                    "product_types": [{"id": 1, "name": "Metal Chair"}],
                                    "subcategories": [{"id": 2, "name": "Ferrous Metals"}],
                                }
                            ],
                        },
                    }
                }
            },
        }
    },
)
async def get_categories(
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
    # TODO: Create include Query param factory
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "materials": {"value": ["materials"]},
                "all": {"value": ["materials", "product_types", "subcategories"]},
            },
        ),
    ] = None,
) -> Sequence[Category]:
    """Get all categories with specified relationships."""
    return await get_models(session, Category, include_relationships=include, model_filter=category_filter)


@category_router.get(
    "/tree",
    response_model=list[CategoryReadWithRecursiveSubCategories],
    summary="Get categories tree",
    responses={
        200: {
            "description": "Category tree with subcategories",
            "content": {
                "application/json": {
                    "examples": {
                        "simple_tree": {
                            "summary": "Simple category tree",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Metals",
                                    "description": "All kinds of metals",
                                    "subcategories": [],
                                },
                                {
                                    "id": 2,
                                    "name": "Plastics",
                                    "description": "All kinds of plastics",
                                    "subcategories": [],
                                },
                            ],
                        },
                        "nested_tree": {
                            "summary": "Nested category tree",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Metals",
                                    "description": "All kinds of metals",
                                    "subcategories": [
                                        {
                                            "id": 2,
                                            "name": "Ferrous metals",
                                            "description": "Iron and its alloys",
                                            "subcategories": [
                                                {
                                                    "id": 3,
                                                    "name": "Steel",
                                                    "description": "Steel alloys",
                                                    "subcategories": [],
                                                }
                                            ],
                                        }
                                    ],
                                },
                                {
                                    "id": 4,
                                    "name": "Plastics",
                                    "description": "All kinds of plastics",
                                    "subcategories": [
                                        {
                                            "id": 5,
                                            "name": "Thermoplastics",
                                            "description": "Plastics that can be melted and reshaped",
                                            "subcategories": [],
                                        }
                                    ],
                                },
                            ],
                        },
                    }
                }
            },
        }
    },
)
async def get_categories_tree(
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Get all base categories and their subcategories in a tree structure."""
    categories: Sequence[Category] = await crud.get_category_trees(
        session, recursion_depth, category_filter=category_filter
    )
    return [
        CategoryReadWithRecursiveSubCategories.model_validate(
            category,
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            },
        )
        for category in categories
    ]


@category_router.get(
    "/{category_id}",
    response_model=CategoryReadWithRelationshipsAndFlatSubCategories,
    responses={
        200: {
            "description": "Category found",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic category",
                            "value": {
                                "id": 1,
                                "name": "Metals",
                                "materials": [],
                                "product_types": [],
                                "subcategories": [],
                            },
                        },
                        "with_relationships": {
                            "summary": "With relationships",
                            "value": {
                                "id": 1,
                                "name": "Metals",
                                "materials": [{"id": 1, "name": "Steel"}],
                                "product_types": [{"id": 1, "name": "Metal Chair"}],
                                "subcategories": [{"id": 2, "name": "Ferrous Metals"}],
                            },
                        },
                    }
                }
            },
        },
        404: {
            "description": "Category not found",
            "content": {"application/json": {"example": {"detail": "Category with id 999 not found"}}},
        },
    },
)
async def get_category(
    session: AsyncSessionDep,
    category_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "materials": {"value": ["materials"]},
                "all": {"value": ["materials", "product_types", "subcategories"]},
            },
        ),
    ] = None,
) -> Category:
    """Get category by ID with specified relationships."""
    return await get_model_by_id(session, Category, category_id, include_relationships=include)


## Subcategory routers ##
@category_router.get(
    "{category_id}/subcategories",
    response_model=list[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get category subcategories with optional filtering and relationships",
)
async def get_subcategories(
    category_id: Annotated[PositiveInt, Path(description="Category ID")],
    category_filter: CategoryFilterDep,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "materials": {"value": ["materials"]},
                "all": {"value": ["materials", "product_types", "subcategories"]},
            },
        ),
    ] = None,
) -> Sequence[Category]:
    """Get all categories with specified relationships."""
    # Validate existence of category
    await get_model_by_id(session, Category, category_id)

    # Get subcategories
    statement = select(Category).where(Category.supercategory_id == category_id)
    return await get_models(
        session, Category, include_relationships=include, model_filter=category_filter, statement=statement
    )


@category_router.get(
    "/{category_id}/subcategories/tree",
    summary="Get category subtree",
    response_model=list[CategoryReadWithRecursiveSubCategories],
    responses={
        200: {
            "description": "Category tree with subcategories",
            "content": {
                "application/json": {
                    "examples": {
                        "stub_tree": {
                            "summary": "Category stub tree",
                            "value": {},
                        },
                        "nested_tree": {
                            "summary": "Nested category tree",
                            "value": {
                                "id": 2,
                                "name": "Ferrous metals",
                                "description": "Iron and its alloys",
                                "subcategories": [
                                    {
                                        "id": 3,
                                        "name": "Steel",
                                        "description": "Steel alloys",
                                        "subcategories": [],
                                    }
                                ],
                            },
                        },
                    }
                },
            },
        },
        404: {
            "description": "Category not found",
            "content": {"application/json": {"example": {"detail": "Category with id 99 not found"}}},
        },
    },
)
async def get_category_subtree(
    category_id: PositiveInt,
    category_filter: CategoryFilterDep,
    session: AsyncSessionDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Get a category subcategories in a tree structure, up to a specified depth."""
    categories: Sequence[Category] = await crud.get_category_trees(
        session, recursion_depth=recursion_depth, supercategory_id=category_id, category_filter=category_filter
    )
    return [
        CategoryReadWithRecursiveSubCategories.model_validate(
            category,
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            },
        )
        for category in categories
    ]


@category_router.get(
    "/{category_id}/subcategories/{subcategory_id}",
    response_model=CategoryReadWithRelationshipsAndFlatSubCategories,
    summary="Get subcategory by ID",
)
async def get_subcategory(
    category_id: PositiveInt,
    subcategory_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "materials": {"value": ["materials"]},
                "all": {"value": ["materials", "product_types", "subcategories"]},
            },
        ),
    ] = None,
) -> Category:
    """Get subcategory by ID with specified relationships."""
    return await get_nested_model_by_id(
        session, Category, category_id, Category, subcategory_id, "supercategory_id", include_relationships=include
    )


### Taxonomy routers ###
taxonomy_router = PublicAPIRouter(prefix="/taxonomies", tags=["taxonomies"])


## GET routers ##
@taxonomy_router.get(
    "",
    response_model=list[TaxonomyRead],
    summary="Get all taxonomies with optional filtering and base categories",
    responses={
        200: {
            "description": "List of taxonomies",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic taxonomies",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Materials",
                                    "description": "Materials taxonomy",
                                    "domains": ["materials"],
                                    "categories": [],
                                }
                            ],
                        },
                        "with_categories": {
                            "summary": "With categories",
                            "value": [{"id": 1, "name": "Materials", "categories": [{"id": 1, "name": "Metals"}]}],
                        },
                    }
                }
            },
        }
    },
)
async def get_taxonomies(
    taxonomy_filter: TaxonomyFilterDep,
    session: AsyncSessionDep,
    *,
    include_base_categories: Annotated[
        bool,
        Query(description="Whether to include base categories"),
    ] = False,
) -> Sequence[Taxonomy]:
    """Get all taxonomies with specified relationships."""
    return await crud.get_taxonomies(
        session, taxonomy_filter=taxonomy_filter, include_base_categories=include_base_categories
    )


@taxonomy_router.get(
    "/{taxonomy_id}",
    response_model=TaxonomyRead,
    responses={
        200: {
            "description": "Taxonomy found",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic taxonomy",
                            "value": {"id": 1, "name": "Materials", "categories": []},
                        },
                        "with_categories": {
                            "summary": "With categories",
                            "value": {"id": 1, "name": "Materials", "categories": [{"id": 1, "name": "Metals"}]},
                        },
                    }
                }
            },
        },
        404: {
            "description": "Taxonomy not found",
            "content": {"application/json": {"example": {"detail": "Taxonomy with id 999 not found"}}},
        },
    },
)
async def get_taxonomy(
    taxonomy_id: PositiveInt,
    session: AsyncSessionDep,
    *,
    include_base_categories: Annotated[
        bool,
        Query(description="Whether to include base categories"),
    ] = False,
) -> Taxonomy:
    """Get taxonomy by ID with base categories."""
    return await crud.get_taxonomy_by_id(session, taxonomy_id, include_base_categories=include_base_categories)


## Taxonomy Category routers ##
@taxonomy_router.get(
    "/{taxonomy_id}/categories",
    response_model=list[CategoryReadWithRecursiveSubCategories],
    summary="Get the categories of a taxonomy",
    responses={
        200: {
            "description": "Taxonomy with category tree",
            "content": {
                "application/json": {
                    "examples": {
                        "simple_tree": {
                            "summary": "Simple taxonomy",
                            "value": {
                                "id": 1,
                                "name": "Metals",
                                "description": "All kinds of metals",
                                "subcategories": [],
                            },
                        },
                        "nested_tree": {
                            "summary": "Taxonomy with nested categories",
                            "value": {
                                "id": 1,
                                "name": "Metals",
                                "description": "All kinds of metals",
                                "subcategories": [
                                    {
                                        "id": 2,
                                        "name": "Ferrous metals",
                                        "description": "Iron and its alloys",
                                        "subcategories": [
                                            {
                                                "id": 3,
                                                "name": "Steel",
                                                "description": "Steel alloys",
                                                "subcategories": [],
                                            }
                                        ],
                                    }
                                ],
                            },
                        },
                    },
                }
            },
        },
    },
)
async def get_taxonomy_category_tree(
    taxonomy_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Get a taxonomy with its category tree structure."""
    categories: Sequence[Category] = await crud.get_category_trees(
        session, recursion_depth, taxonomy_id=taxonomy_id, category_filter=category_filter
    )
    return [
        CategoryReadWithRecursiveSubCategories.model_validate(
            category,
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            },
        )
        for category in categories
    ]


@taxonomy_router.get(
    "/{taxonomy_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get taxonomy category by ID",
)
async def get_taxonomy_category(
    taxonomy_id: PositiveInt,
    category_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "materials": {"value": ["materials"]},
                "all": {"value": ["materials", "product_types", "subcategories"]},
            },
        ),
    ] = None,
) -> Category:
    """Get category by ID with specified relationships."""
    return await get_nested_model_by_id(
        session, Taxonomy, taxonomy_id, Category, category_id, "taxonomy_id", include_relationships=include
    )


### Material routers ###
material_router = PublicAPIRouter(prefix="/materials", tags=["materials"])


## GET routers ##
@material_router.get(
    "",
    response_model=list[MaterialReadWithRelationships],
    summary="Get all materials with optional relationships",
    responses={
        200: {
            "description": "List of materials",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Materials without relationships",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Steel",
                                    "description": "Common structural steel",
                                    "categories": [],
                                    "product_links": [],
                                    "images": [],
                                    "files": [],
                                }
                            ],
                        },
                        "with_categories": {
                            "summary": "Materials with categories",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Steel",
                                    "categories": [{"id": 1, "name": "Metals"}],
                                    "product_links": [],
                                    "images": [],
                                    "files": [],
                                }
                            ],
                        },
                    }
                }
            },
        }
    },
)
async def get_materials(
    session: AsyncSessionDep,
    material_filter: MaterialFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "categories": {"value": {"categories"}},
                "all": {"value": ["categories", "files", "images", "product_links"]},
            },
        ),
    ] = None,
) -> Sequence[Material]:
    """Get all materials with specified relationships."""
    return await get_models(session, Material, include_relationships=include, model_filter=material_filter)


@material_router.get(
    "/{material_id}",
    response_model=MaterialReadWithRelationships,
    responses={
        200: {
            "description": "Material found",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic material",
                            "value": {
                                "id": 1,
                                "name": "Steel",
                                "description": "Common structural steel",
                                "density_kg_m3": 7850,
                                "created_at": "2025-09-22T14:30:45Z",
                                "updated_at": "2025-09-22T14:30:45Z",
                            },
                        },
                        "with_categories": {
                            "summary": "With categories",
                            "value": {
                                "id": 1,
                                "name": "Steel",
                                "description": "Common structural steel",
                                "density_kg_m3": 7850,
                                "created_at": "2025-09-22T14:30:45Z",
                                "updated_at": "2025-09-22T14:30:45Z",
                                "categories": [
                                    {
                                        "id": 1,
                                        "name": "Metals",
                                        "description": "All kinds of metals",
                                        "taxonomy_id": 1,
                                        "super_category_id": None,
                                    }
                                ],
                            },
                        },
                        "with_all": {
                            "summary": "All relationships",
                            "value": {
                                "id": 1,
                                "name": "Steel",
                                "description": "Common structural steel",
                                "density_kg_m3": 7850,
                                "created_at": "2025-09-22T14:30:45Z",
                                "updated_at": "2025-09-22T14:30:45Z",
                                "categories": [
                                    {
                                        "id": 1,
                                        "name": "Metals",
                                        "description": "All kinds of metals",
                                        "taxonomy_id": 1,
                                        "super_category_id": None,
                                    }
                                ],
                                "images": [{"id": 1, "url": "/images/steel.jpg"}],
                                "files": [{"id": 1, "url": "/files/steel.csv"}],
                            },
                        },
                    }
                }
            },
        },
        404: {
            "description": "Material not found",
            "content": {"application/json": {"example": {"detail": "Material with id 999 not found"}}},
        },
    },
)
async def get_material(
    session: AsyncSessionDep,
    material_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "categories": {"value": ["categories"]},
                "all": {"value": ["categories", "images", "files"]},
            },
        ),
    ] = None,
) -> Material:
    """Get material by ID with specified relationships."""
    return await get_model_by_id(session, Material, model_id=material_id, include_relationships=include)


## Material Category routers ##
@material_router.get(
    "/{material_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of material",
)
async def get_categories_for_material(
    material_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "taxonomy": {"value": ["taxonomy"]},
                "all": {"value": ["taxonomy", "subcategories"]},
            },
        ),
    ],
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """View categories of a material."""
    return await get_linked_models(
        session,
        Material,
        material_id,
        Category,
        CategoryMaterialLink,
        "material_id",
        include_relationships=include,
        model_filter=category_filter,
    )


@material_router.get(
    "/{material_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_category_for_material(
    material_id: PositiveInt,
    category_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "taxonomy": {"value": ["taxonomy"]},
                "all": {"value": ["taxonomy", "subcategories"]},
            },
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Get a category by ID for a specific material."""
    return await get_linked_model_by_id(
        session,
        Material,
        material_id,
        Category,
        category_id,
        CategoryMaterialLink,
        "material_id",
        "category_id",
        include=include,
    )


## Material Storage routers ##
add_storage_routes(
    router=material_router,
    parent_api_model_name=Material.get_api_model_name(),
    files_crud=crud.material_files_crud,
    images_crud=crud.material_images_crud,
    include_methods={StorageRouteMethod.GET},  # Non-superusers can only read Material files
)

### ProductType routers ###
product_type_router = PublicAPIRouter(prefix="/product-types", tags=["product-types"])


## Basic CRUD routers ##
@product_type_router.get(
    "",
    summary="Get all product types",
    responses={
        200: {
            "description": "List of product types",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Product types without relationships",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Chair",
                                    "description": "Basic chair",
                                    "categories": [],
                                    "products": [],
                                    "images": [],
                                    "files": [],
                                }
                            ],
                        },
                        "with_categories": {
                            "summary": "Product types with categories",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Chair",
                                    "categories": [{"id": 1, "name": "Furniture"}],
                                    "products": [],
                                    "images": [],
                                    "files": [],
                                }
                            ],
                        },
                    }
                }
            },
        }
    },
)
async def get_product_types(
    session: AsyncSessionDep,
    product_type_filter: ProductTypeFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,  # TODO: Consider supporting comma-separated list of relationships to include
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "categories": {"value": {"categories"}},
                "all": {"value": ["categories", "files", "images", "product_links"]},
            },
        ),
    ] = None,
) -> Sequence[ProductType]:
    """Get a list of all product types."""
    return await get_models(session, ProductType, include_relationships=include, model_filter=product_type_filter)


@product_type_router.get(
    "/{product_type_id}",
    response_model=ProductTypeReadWithRelationships,
    summary="Get product type by ID",
    responses={
        200: {
            "description": "Product type found",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Basic product type",
                            "value": {
                                "id": 1,
                                "name": "Chair",
                                "description": "Basic chair",
                                "categories": [],
                                "products": [],
                                "images": [],
                                "files": [],
                            },
                        },
                        "with_relationships": {
                            "summary": "With relationships",
                            "value": {
                                "id": 1,
                                "name": "Chair",
                                "categories": [{"id": 1, "name": "Furniture"}],
                                "products": [{"id": 1, "name": "IKEA Chair"}],
                                "images": [{"id": 1, "url": "/images/chair.jpg"}],
                            },
                        },
                    }
                }
            },
        },
        404: {
            "description": "Product type not found",
            "content": {"application/json": {"example": {"detail": "ProductType with id 999 not found"}}},
        },
    },
)
async def get_product_type(
    session: AsyncSessionDep,
    product_type_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "categories": {"value": ["categories"]},
                "all": {"value": ["categories", "images", "files"]},
            },
        ),
    ] = None,
) -> ProductType:
    """Get a single product type by ID with its categories and products."""
    return await get_model_by_id(session, ProductType, product_type_id, include_relationships=include)


## ProductType Category routers ##
# TODO: deduplicate category routers for materials and product types and move to the common.router_factories module
@product_type_router.get(
    "/{product_type_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of product type",
)
async def get_categories_for_product_type(
    product_type_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "taxonomy": {"value": ["taxonomy"]},
                "all": {"value": ["taxonomy", "subcategories"]},
            },
        ),
    ],
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """View categories of a product type."""
    return await get_linked_models(
        session,
        ProductType,
        product_type_id,
        Category,
        CategoryProductTypeLink,
        "product_type_id",
        include_relationships=include,
        model_filter=category_filter,
    )


@product_type_router.get(
    "/{product_type_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_category_for_product_type(
    product_type_id: PositiveInt,
    category_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "taxonomy": {"value": ["taxonomy"]},
                "all": {"value": ["taxonomy", "subcategories"]},
            },
        ),
    ],
    session: AsyncSessionDep,
) -> Category:
    """Get a category by ID for a product type."""
    return await get_linked_model_by_id(
        session,
        ProductType,
        product_type_id,
        Category,
        category_id,
        CategoryProductTypeLink,
        "product_type_id",
        "category_id",
        include=include,
    )


## ProductType Storage routers ##
add_storage_routes(
    router=product_type_router,
    parent_api_model_name=ProductType.get_api_model_name(),
    files_crud=crud.product_type_files,
    images_crud=crud.product_type_images,
    include_methods={StorageRouteMethod.GET},  # Non-superusers can only read ProductType files
)

### Router inclusion ###
router.include_router(category_router)
router.include_router(taxonomy_router)
router.include_router(material_router)
router.include_router(product_type_router)
