"""Mutation-focused routers for product endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import Body
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.common.crud.base import get_nested_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ProductRead
from app.api.data_collection import crud
from app.api.data_collection.dependencies import UserOwnedProductDep, get_user_owned_product_id
from app.api.data_collection.models import Product
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    ProductCreateWithComponents,
    ProductReadWithProperties,
    ProductUpdate,
    ProductUpdateWithProperties,
)
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

product_mutation_router = PublicAPIRouter(prefix="/products", tags=["products"])


@product_mutation_router.post(
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
                            "weight_g": 2000,
                            "height_cm": 150,
                            "width_cm": 70,
                            "depth_cm": 50,
                        },
                        "videos": [
                            {"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}
                        ],
                        "bill_of_materials": [
                            {"quantity": 15, "unit": "g", "material_id": 1},
                            {"quantity": 5, "unit": "g", "material_id": 2},
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
                            "weight_g": 20000,
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
                                    "weight_g": 5000,
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
                                            "weight_g": 2000,
                                            "height_cm": 10,
                                            "width_cm": 40,
                                            "depth_cm": 30,
                                        },
                                        "product_type_id": 3,
                                        "bill_of_materials": [
                                            {"quantity": 1.5, "unit": "g", "material_id": 1},
                                            {"quantity": 0.5, "unit": "g", "material_id": 2},
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
    return await crud.create_product(session, product, current_user.db_id)


@product_mutation_router.patch("/{product_id}", response_model=ProductReadWithProperties, summary="Update product")
async def update_product(
    product_update: ProductUpdate | ProductUpdateWithProperties,
    db_product: UserOwnedProductDep,
    session: AsyncSessionDep,
) -> Product:
    """Update an existing product."""
    return await crud.update_product(session, db_product.db_id, product_update)


@product_mutation_router.delete(
    "/{product_id}",
    status_code=204,
    summary="Delete product",
)
async def delete_product(db_product: UserOwnedProductDep, session: AsyncSessionDep) -> None:
    """Delete a product, including components."""
    await crud.delete_product(session, db_product.db_id)


@product_mutation_router.post(
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
                        "bill_of_materials": [{"material_id": 1, "quantity": 0.5, "unit": "g"}],
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
                                "bill_of_materials": [{"material_id": 2, "quantity": 0.3, "unit": "g"}],
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
        parent_product=db_product,
    )


@product_mutation_router.delete(
    "/{product_id}/components/{component_id}",
    status_code=204,
    summary="Delete product component",
)
async def delete_product_component(
    db_product: UserOwnedProductDep, component_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a component in a product, including subcomponents."""
    await get_nested_model_by_id(session, Product, db_product.db_id, Product, component_id, "parent_id")
    await crud.delete_product(session, component_id)


add_storage_routes(
    router=product_mutation_router,
    parent_api_model_name=Product.get_api_model_name(),
    files_crud=crud.product_files_crud,
    images_crud=crud.product_images_crud,
    include_methods={StorageRouteMethod.GET, StorageRouteMethod.POST, StorageRouteMethod.DELETE},
    read_parent_auth_dep=None,
    modify_parent_auth_dep=get_user_owned_product_id,
)
