"""Routers for data collection models."""

from collections.abc import Sequence
from typing import TYPE_CHECKING, Annotated

from asyncache import cached
from cachetools import LRUCache, TTLCache
from fastapi import APIRouter, Body, HTTPException, Path, Query, Request
from fastapi.responses import RedirectResponse
from fastapi_filter import FilterDepends
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt
from sqlmodel import select

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.background_data.models import Material
from app.api.background_data.routers.public import RecursionDepthQueryParam
from app.api.common.crud.associations import (
    get_linking_model_with_ids_if_it_exists,
)
from app.api.common.crud.base import (
    get_model_by_id,
    get_models,
    get_nested_model_by_id,
    get_paginated_models,
)
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists
from app.api.common.models.associations import MaterialProductLink
from app.api.common.models.enums import Unit
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkReadWithinProduct,
    MaterialProductLinkUpdate,
)
from app.api.common.schemas.base import ProductRead
from app.api.data_collection import crud
from app.api.data_collection.dependencies import (
    MaterialProductLinkFilterDep,
    ProductByIDDep,
    ProductFilterWithRelationshipsDep,
    UserOwnedProductDep,
    get_user_owned_product_id,
)
from app.api.data_collection.models import (
    PhysicalProperties,
    Product,
)
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    PhysicalPropertiesCreate,
    PhysicalPropertiesRead,
    PhysicalPropertiesUpdate,
    ProductCreateWithComponents,
    ProductReadWithProperties,
    ProductReadWithRecursiveComponents,
    ProductReadWithRelationshipsAndFlatComponents,
    ProductUpdate,
    ProductUpdateWithProperties,
)
from app.api.file_storage.crud import create_video, delete_video
from app.api.file_storage.filters import VideoFilter
from app.api.file_storage.models.models import Video
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes
from app.api.file_storage.schemas import VideoCreateWithinProduct, VideoReadWithinProduct

if TYPE_CHECKING:
    from sqlmodel.sql._expression_select_cls import SelectOfScalar

# Initialize API router
router = APIRouter()


## User Product routers ##
user_product_redirect_router = PublicAPIRouter(prefix="/users/me/products", tags=["products"])


@user_product_redirect_router.get(
    "",
    response_class=RedirectResponse,
    status_code=307,  # Temporary redirect that preserves method and body
    summary="Redirect to user's products",
)
async def redirect_to_current_user_products(
    current_user: CurrentActiveVerifiedUserDep,
    request: Request,
) -> RedirectResponse:
    """Redirect /users/me/products to /users/{id}/products for better caching."""
    # Preserve query parameters
    query_string = str(request.url.query)
    redirect_url = f"/users/{current_user.id}/products"
    if query_string:
        redirect_url += f"?{query_string}"
    return RedirectResponse(url=redirect_url, status_code=307)


user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])


@user_product_router.get(
    "",
    response_model=list[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get products collected by a user",
)
async def get_user_products(
    user_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": {}},
                "properties": {"value": {"physical_properties"}},
                "materials": {"value": {"bill_of_materials"}},
                "components": {"value": {"components"}},
                "media": {"value": {"images", "videos", "files"}},
                "all": {
                    "value": {
                        "physical_properties",
                        "images",
                        "videos",
                        "files",
                        "product_type",
                        "bill_of_materials",
                        "components",
                    }
                },
            },
        ),
    ] = None,
) -> Sequence[Product]:
    """Get products collected by a specific user."""
    # NOTE: If needed, we can open up this endpoint to any user by removing this ownership check
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    return await get_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=(select(Product).where(Product.owner_id == user_id)),
    )


### Product Routers ###
product_router = PublicAPIRouter(prefix="/products", tags=["products"])


## Utility functions ##
def convert_components_to_read_model(
    components: list[Product], max_depth: int = 1, current_depth: int = 0
) -> list[ComponentReadWithRecursiveComponents]:
    """Convert components to read model recursively."""
    if current_depth >= max_depth:
        return []

    return [
        ComponentReadWithRecursiveComponents.model_validate(
            component,
            update={
                "components": convert_components_to_read_model(component.components or [], max_depth, current_depth + 1)
            },
        )
        for component in components
    ]


## GET routers ##
@product_router.get(
    "",
    response_model=Page[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get all products with optional relationships",
)
async def get_products(
    session: AsyncSessionDep,
    product_filter: ProductFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "properties": {"value": ["physical_properties"]},
                "materials": {"value": ["bill_of_materials"]},
                "media": {"value": ["images", "videos", "files"]},
                "components": {"value": ["components"]},
                "all": {
                    "value": [
                        "physical_properties",
                        "images",
                        "videos",
                        "files",
                        "product_type",
                        "bill_of_materials",
                        "components",
                    ]
                },
            },
        ),
    ] = None,
    *,
    include_components_as_base_products: Annotated[
        bool | None,
        Query(description="Whether to include components as base products in the response"),
    ] = None,
) -> Page[Sequence[ProductReadWithRelationshipsAndFlatComponents]]:
    """Get all products with specified relationships.

    Relationships that can be included:
    - physical_properties: Physical measurements and attributes
    - images: Product images
    - videos: Product videos
    - files: Related documents
    - product_type: Type classification
    - bill_of_materials: Material composition
    """
    # TODO: Instead of this hacky parameter, distinguish between base products and components on the model level
    # For now, only return base products (those without a parent)
    if include_components_as_base_products:
        statement: SelectOfScalar[Product] = select(Product)
    else:
        statement: SelectOfScalar[Product] = select(Product).where(Product.parent_id == None)

    return await get_paginated_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=statement,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_router.get(
    "/tree",
    response_model=list[ProductReadWithRecursiveComponents],
    summary="Get products tree",
    responses={
        200: {
            "description": "Product tree with components",
            "content": {
                "application/json": {
                    "examples": {
                        "simple_tree": {
                            "summary": "Simple product tree",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Office Chair",
                                    "description": "Complete chair assembly",
                                    "components": [],
                                }
                            ],
                        },
                        "nested_tree": {
                            "summary": "Nested product tree",
                            "value": [
                                {
                                    "id": 1,
                                    "name": "Office Chair",
                                    "description": "Complete chair assembly",
                                    "components": [
                                        {
                                            "id": 2,
                                            "name": "Seat Assembly",
                                            "description": "Chair seat",
                                            "components": [
                                                {
                                                    "id": 3,
                                                    "name": "Cushion",
                                                    "description": "Foam cushion",
                                                    "components": [],
                                                }
                                            ],
                                        }
                                    ],
                                }
                            ],
                        },
                    }
                }
            },
        }
    },
)
async def get_products_tree(
    session: AsyncSessionDep,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ProductReadWithRecursiveComponents]:
    """Get all base products and their components in a tree structure."""
    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, product_filter=product_filter
    )
    return [
        ProductReadWithRecursiveComponents.model_validate(
            product,
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            },
        )
        for product in products
    ]


@product_router.get(
    "/{product_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product by ID",
)
async def get_product(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "properties": {"value": ["physical_properties"]},
                "materials": {"value": ["bill_of_materials"]},
                "media": {"value": ["images", "videos", "files"]},
                "components": {"value": ["components"]},
                "all": {
                    "value": [
                        "physical_properties",
                        "images",
                        "videos",
                        "files",
                        "product_type",
                        "bill_of_materials",
                        "components",
                    ]
                },
            },
        ),
    ] = None,
) -> Product:
    """Get product by ID with specified relationships.

    Relationships that can be included:
    - physical_properties: Physical measurements and attributes
    - images: Product images
    - videos: Product videos
    - files: Related documents
    - product_type: Type classification
    - bill_of_materials: Material composition
    """
    return await get_model_by_id(session, Product, product_id, include_relationships=include)


## POST routers ##
@product_router.post(
    "",
    response_model=ProductRead,
    summary="Create a new product, optionally with components",
    status_code=201,
)
async def create_product(
    product: Annotated[
        ProductCreateWithComponents,
        Body(
            description="Product to create",
            openapi_examples={
                "basic": {
                    "summary": "Basic product without components",
                    "value": {
                        "name": "Office Chair",
                        "description": "Complete chair assembly",
                        "brand": "Brand 1",
                        "model": "Model 1",
                        "dismantling_time_start": "2025-09-22T14:30:45Z",
                        "dismantling_time_end": "2025-09-22T16:30:45Z",
                        "product_type_id": 1,
                        "physical_properties": {
                            "weight_kg": 20,
                            "height_cm": 150,
                            "width_cm": 70,
                            "depth_cm": 50,
                        },
                        "videos": [
                            {"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}
                        ],
                        "bill_of_materials": [
                            {"quantity": 15, "unit": "kg", "material_id": 1},
                            {"quantity": 5, "unit": "kg", "material_id": 2},
                        ],
                    },
                },
                "with_components": {
                    "summary": "Product with components",
                    "value": {
                        "name": "Office Chair",
                        "description": "Complete chair assembly",
                        "brand": "Brand 1",
                        "model": "Model 1",
                        "dismantling_time_start": "2025-09-22T14:30:45Z",
                        "dismantling_time_end": "2025-09-22T16:30:45Z",
                        "product_type_id": 1,
                        "physical_properties": {
                            "weight_kg": 20,
                            "height_cm": 150,
                            "width_cm": 70,
                            "depth_cm": 50,
                        },
                        "videos": [
                            {"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}
                        ],
                        "o": 1,
                        "components": [
                            {
                                "name": "Office Chair Seat",
                                "description": "Seat assembly",
                                "brand": "Brand 2",
                                "model": "Model 2",
                                "dismantling_time_start": "2025-09-22T14:30:45Z",
                                "dismantling_time_end": "2025-09-22T16:30:45Z",
                                "amount_in_parent": 1,
                                "product_type_id": 2,
                                "physical_properties": {
                                    "weight_kg": 5,
                                    "height_cm": 50,
                                    "width_cm": 40,
                                    "depth_cm": 30,
                                },
                                "components": [
                                    {
                                        "name": "Seat Cushion",
                                        "description": "Seat cushion assembly",
                                        "amount_in_parent": 1,
                                        "physical_properties": {
                                            "weight_kg": 2,
                                            "height_cm": 10,
                                            "width_cm": 40,
                                            "depth_cm": 30,
                                        },
                                        "product_type_id": 3,
                                        "bill_of_materials": [
                                            {"quantity": 1.5, "unit": "kg", "material_id": 1},
                                            {"quantity": 0.5, "unit": "kg", "material_id": 2},
                                        ],
                                    }
                                ],
                            }
                        ],
                    },
                },
            },
        ),
    ],
    current_user: CurrentActiveVerifiedUserDep,
    session: AsyncSessionDep,
) -> Product:
    """Create a new product."""
    return await crud.create_product(session, product, current_user.id)


## PATCH routers ##
@product_router.patch("/{product_id}", response_model=ProductReadWithProperties, summary="Update product")
async def update_product(
    product_update: ProductUpdate | ProductUpdateWithProperties,
    db_product: UserOwnedProductDep,
    session: AsyncSessionDep,
) -> Product:
    """Update an existing product."""
    return await crud.update_product(session, db_product.id, product_update)


## DELETE routers ##
@product_router.delete(
    "/{product_id}",
    status_code=204,
    summary="Delete product",
)
async def delete_product(db_product: UserOwnedProductDep, session: AsyncSessionDep) -> None:
    """Delete a product, including components."""
    await crud.delete_product(session, db_product.id)


## Product Component routers ##
@product_router.get(
    "/{product_id}/components/tree",
    summary="Get product component subtree",
    response_model=list[ComponentReadWithRecursiveComponents],
    responses={
        200: {
            "description": "Product tree with components",
            "content": {
                "application/json": {
                    "examples": {
                        "stub_tree": {
                            "summary": "Product without components",
                            "value": [],
                        },
                        "nested_tree": {
                            "summary": "Nested component tree",
                            "value": [
                                {
                                    "id": 2,
                                    "name": "Seat Assembly",
                                    "description": "Chair seat",
                                    "components": [
                                        {
                                            "id": 3,
                                            "name": "Cushion",
                                            "description": "Foam cushion",
                                            "components": [],
                                        }
                                    ],
                                }
                            ],
                        },
                    }
                },
            },
        },
        404: {
            "description": "Product not found",
            "content": {"application/json": {"example": {"detail": "Product with id 999 not found"}}},
        },
    },
)
async def get_product_subtree(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ComponentReadWithRecursiveComponents]:
    """Get a product's components in a tree structure, up to a specified depth."""
    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, parent_id=product_id, product_filter=product_filter
    )

    return [
        ComponentReadWithRecursiveComponents.model_validate(
            product,
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            },
        )
        for product in products
    ]


@product_router.get(
    "/{product_id}/components",
    response_model=list[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get product components",
)
async def get_product_components(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "properties": {"value": ["physical_properties"]},
                "materials": {"value": ["bill_of_materials"]},
                "media": {"value": ["images", "videos", "files"]},
                "components": {"value": ["components"]},
                "all": {
                    "value": [
                        "physical_properties",
                        "images",
                        "videos",
                        "files",
                        "product_type",
                        "bill_of_materials",
                        "components",
                    ]
                },
            },
        ),
    ] = None,
) -> Sequence[Product]:
    """Get all components of a product."""
    # Validate existence of product
    await get_model_by_id(session, Product, product_id)

    # Get components
    return await get_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=(select(Product).where(Product.parent_id == product_id)),
    )


@product_router.get(
    "/{product_id}/components/{component_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product component by ID",
)
async def get_product_component(
    product_id: PositiveInt,
    component_id: PositiveInt,
    *,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "properties": {"value": ["physical_properties"]},
                "materials": {"value": ["bill_of_materials"]},
                "media": {"value": ["images", "videos", "files"]},
                "components": {"value": ["components"]},
                "all": {
                    "value": [
                        "physical_properties",
                        "images",
                        "videos",
                        "files",
                        "product_type",
                        "bill_of_materials",
                        "components",
                    ]
                },
            },
        ),
    ] = None,
    session: AsyncSessionDep,
) -> Product:
    """Get component by ID with specified relationships."""
    return await get_nested_model_by_id(
        session, Product, product_id, Product, component_id, "parent_id", include_relationships=include
    )


@product_router.post(
    "/{product_id}/components",
    response_model=ComponentReadWithRecursiveComponents,
    status_code=201,
    summary="Create a new component in a product",
)
async def add_component_to_product(
    db_product: UserOwnedProductDep,
    component: Annotated[
        ComponentCreateWithComponents,
        Body(
            openapi_examples={
                "simple": {
                    "summary": "Basic component",
                    "description": "Create a component without subcomponents",
                    "value": {
                        "name": "Seat Assembly",
                        "description": "Chair seat component",
                        "amount_in_parent": 1,
                        "bill_of_materials": [{"material_id": 1, "quantity": 0.5, "unit": "kg"}],
                    },
                },
                "nested": {
                    "summary": "Component with subcomponents",
                    "description": "Create a component with nested subcomponents",
                    "value": {
                        "name": "Seat Assembly",
                        "description": "Chair seat with cushion",
                        "amount_in_parent": 1,
                        "components": [
                            {
                                "name": "Cushion",
                                "description": "Foam cushion",
                                "amount_in_parent": 1,
                                "bill_of_materials": [{"material_id": 2, "quantity": 0.3, "unit": "kg"}],
                            }
                        ],
                    },
                },
            }
        ),
    ],
    session: AsyncSessionDep,
) -> Product:
    """Create a new component in an existing product."""
    return await crud.create_component(
        db=session,
        component=component,
        parent_product_id=db_product.id,
        owner_id=None,
    )


@product_router.delete(
    "/{product_id}/components/{component_id}",
    status_code=204,
    summary="Delete product component",
)
async def delete_product_component(
    db_product: UserOwnedProductDep, component_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a component in a product, including subcomponents."""
    # Validate existence of product and component
    await get_nested_model_by_id(session, Product, db_product.id, Product, component_id, "parent_id")

    # Delete category
    await crud.delete_product(session, component_id)


## Product Storage routers ##
add_storage_routes(
    router=product_router,
    parent_api_model_name=Product.get_api_model_name(),
    files_crud=crud.product_files_crud,
    images_crud=crud.product_images_crud,
    include_methods={StorageRouteMethod.GET, StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    read_parent_auth_dep=None,
    # TODO: Build ownership check for modification operations
    modify_parent_auth_dep=get_user_owned_product_id,
)


## Product Property routers ##
@product_router.get(
    "/{product_id}/physical_properties",
    response_model=PhysicalPropertiesRead,
    summary="Get product physical properties",
)
async def get_product_physical_properties(product_id: PositiveInt, session: AsyncSessionDep) -> PhysicalProperties:
    """Get physical properties for a product."""
    return await crud.get_physical_properties(session, product_id)


@product_router.post(
    "/{product_id}/physical_properties",
    response_model=PhysicalPropertiesRead,
    status_code=201,
    summary="Create product physical properties",
)
async def create_product_physical_properties(
    product: UserOwnedProductDep,
    properties: PhysicalPropertiesCreate,
    session: AsyncSessionDep,
) -> PhysicalProperties:
    """Create physical properties for a product."""
    return await crud.create_physical_properties(session, properties, product.id)


@product_router.patch(
    "/{product_id}/physical_properties",
    response_model=PhysicalPropertiesRead,
    summary="Update product physical properties",
)
async def update_product_physical_properties(
    product: UserOwnedProductDep,
    properties: PhysicalPropertiesUpdate,
    session: AsyncSessionDep,
) -> PhysicalProperties:
    """Update physical properties for a product."""
    return await crud.update_physical_properties(session, product.id, properties)


@product_router.delete(
    "/{product_id}/physical_properties",
    status_code=204,
    summary="Delete product physical properties",
)
async def delete_product_physical_properties(
    product: UserOwnedProductDep,
    session: AsyncSessionDep,
) -> None:
    """Delete physical properties for a product."""
    await crud.delete_physical_properties(session, product)


## Product Video routers ##
@product_router.get(
    "/{product_id}/videos",
    response_model=list[VideoReadWithinProduct],
    summary="Get all videos for a product",
    responses={
        200: {
            "description": "List of videos",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Videos for a product",
                            "value": [
                                {
                                    "id": 1,
                                    "url": "https://example.com/video1",
                                    "description": "Product disassembly video",
                                }
                            ],
                        }
                    }
                }
            },
        },
        404: {
            "description": "Product not found",
            "content": {"application/json": {"example": {"detail": "Product with id 999 not found"}}},
        },
    },
)
async def get_product_videos(
    session: AsyncSessionDep,
    product: ProductByIDDep,
    video_filter: VideoFilter = FilterDepends(VideoFilter),  # noqa: B008 # FilterDepends is a valid Depends wrapper
) -> Sequence[Video]:
    """Get all videos associated with a specific product."""
    # Create statement to filter by product_id
    statement: SelectOfScalar[Video] = select(Video).where(Video.product_id == product.id)

    return await get_models(
        session,
        Video,
        model_filter=video_filter,
        statement=statement,
    )


@product_router.get(
    "/{product_id}/videos/{video_id}",
    response_model=VideoReadWithinProduct,
    summary="Get video by ID",
)
async def get_product_video(
    product_id: PositiveInt,
    video_id: PositiveInt,
    session: AsyncSessionDep,
) -> Video:
    """Get a video associated with a specific product."""
    return await get_nested_model_by_id(session, Product, product_id, Video, video_id, "product_id")


@product_router.post(
    "/{product_id}/videos",
    response_model=VideoReadWithinProduct,
    status_code=201,
    summary="Create a new video for a product",
    responses={
        201: {
            "description": "Video created successfully",
            "content": {
                "application/json": {
                    "example": {
                        "id": 1,
                        "url": "https://example.com/video1",
                        "description": "Product disassembly video",
                    }
                }
            },
        },
        404: {
            "description": "Product not found",
            "content": {"application/json": {"example": {"detail": "Product with id 999 not found"}}},
        },
    },
)
async def create_product_video(
    product: UserOwnedProductDep,
    video: VideoCreateWithinProduct,
    session: AsyncSessionDep,
) -> Video:
    """Create a new video associated with a specific product."""
    return await create_video(session, video, product_id=product.id)


@product_router.delete(
    "/{product_id}/videos/{video_id}",
    status_code=204,
    summary="Delete video by ID",
)
async def delete_product_video(product: UserOwnedProductDep, video_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a video associated with a specific product."""
    # Validate existence of product and video
    await get_nested_model_by_id(session, Product, product.id, Video, video_id, "product_id")

    # Delete video
    await delete_video(session, video_id)


## Product Bill of Material routers ##
@product_router.get(
    "/{product_id}/materials",
    response_model=list[MaterialProductLinkReadWithinProduct],
    summary="Get product bill of materials",
)
async def get_product_bill_of_materials(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    material_filter: MaterialProductLinkFilterDep,
) -> Sequence[MaterialProductLink]:
    """Get bill of materials for a product."""
    # Validate existence of product
    await db_get_model_with_id_if_it_exists(session, Product, product_id)

    statement: SelectOfScalar[MaterialProductLink] = (
        select(MaterialProductLink).join(Material).where(MaterialProductLink.product_id == product_id)
    )

    return await get_models(
        session,
        MaterialProductLink,
        model_filter=material_filter,
        statement=statement,
    )


@product_router.get(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Get material in product bill of materials",
)
async def get_material_in_product_bill_of_materials(
    product_id: PositiveInt,
    material_id: PositiveInt,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Get a material in a product's bill of materials."""
    return await get_linking_model_with_ids_if_it_exists(
        session,
        MaterialProductLink,
        product_id,
        material_id,
        "product_id",
        "material_id",
    )


@product_router.post(
    "/{product_id}/materials",
    response_model=list[MaterialProductLinkReadWithinProduct],
    status_code=201,
    summary="Add multiple materials to product bill of materials",
)
async def add_materials_to_product(
    product: UserOwnedProductDep,
    materials: Annotated[
        list[MaterialProductLinkCreateWithinProduct],
        Body(
            description="List of materials-product links to add to the product",
            examples=[
                [
                    {"material_id": 1, "quantity": 5, "unit": "kg"},
                    {"material_id": 2, "quantity": 10, "unit": "kg"},
                ]
            ],
        ),
    ],
    session: AsyncSessionDep,
) -> list[MaterialProductLink]:
    """Add multiple materials to a product's bill of materials."""
    return await crud.add_materials_to_product(session, product.id, materials)


@product_router.post(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    status_code=201,
    summary="Add single material to product bill of materials",
)
async def add_material_to_product(
    product: UserOwnedProductDep,
    material_id: Annotated[
        PositiveInt,
        Path(description="ID of material to add to the product", examples=[1]),
    ],
    material_link: Annotated[
        MaterialProductLinkCreateWithinProductAndMaterial,
        Body(
            description="Material-product link details",
            examples=[[{"quantity": 5, "unit": "kg"}]],
        ),
    ],
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Add a single material to a product's bill of materials."""
    return await crud.add_material_to_product(session, product.id, material_link, material_id=material_id)


@product_router.patch(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Update material in product bill of materials",
)
async def update_product_bill_of_materials(
    product: UserOwnedProductDep,
    material_id: PositiveInt,
    material: MaterialProductLinkUpdate,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Update material in bill of materials for a product."""
    return await crud.update_material_within_product(session, product.id, material_id, material)


@product_router.delete(
    "/{product_id}/materials/{material_id}",
    status_code=204,
    summary="Remove single material from product bill of materials",
)
async def remove_material_from_product(
    product: UserOwnedProductDep,
    material_id: Annotated[
        PositiveInt,
        Path(description="ID of material to remove from the product"),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove a single material from a product's bill of materials."""
    await crud.remove_materials_from_product(session, product.id, {material_id})


@product_router.delete(
    "/{product_id}/materials",
    status_code=204,
    summary="Remove multiple materials from product bill of materials",
)
async def remove_materials_from_product_bulk(
    product: UserOwnedProductDep,
    material_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Material IDs to remove from the product",
            default_factory=set,
            examples=[[1, 2, 3]],
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove multiple materials from a product's bill of materials."""
    await crud.remove_materials_from_product(session, product.id, material_ids)


### Ancillary Search Routers ###

search_router = PublicAPIRouter(prefix="", include_in_schema=True)


@search_router.get("/brands")
@cached(cache=TTLCache(maxsize=1, ttl=60))
async def get_brands(
    session: AsyncSessionDep,
) -> Sequence[str]:
    """Get a list of unique product brands."""
    return await crud.get_unique_product_brands(session)


### Unit Routers ###
unit_router = PublicAPIRouter(prefix="/units", tags=["units"], include_in_schema=True)


@unit_router.get("")
@cached(LRUCache(maxsize=1))  # Cache units, as they are defined on app startup and do not change
async def get_units() -> list[str]:
    """Get a list of available units."""
    return [unit.value for unit in Unit]


### Router inclusion ###
router.include_router(user_product_redirect_router)
router.include_router(user_product_router)
router.include_router(product_router)
router.include_router(search_router)
router.include_router(unit_router)
