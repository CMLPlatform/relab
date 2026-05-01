"""Stable component CRUD routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Body, HTTPException
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep, OptionalCurrentActiveUserDep
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ComponentRead
from app.api.data_collection.crud.product_commands import create_component
from app.api.data_collection.crud.product_commands import delete_product as delete_product_record
from app.api.data_collection.crud.product_commands import update_product as update_product_record
from app.api.data_collection.crud.product_tree_queries import PRODUCT_READ_DETAIL_RELATIONSHIPS
from app.api.data_collection.dependencies import UserOwnedComponentDep
from app.api.data_collection.examples import COMPONENT_CREATE_OPENAPI_EXAMPLES
from app.api.data_collection.models.product import Product
from app.api.data_collection.presentation.product_reads import to_component_read
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    ComponentReadWithRelationshipsAndFlatComponents,
    ProductUpdate,
)

component_core_router = PublicAPIRouter(prefix="/components", tags=["components"])


@component_core_router.get(
    "/{component_id}",
    response_model=ComponentReadWithRelationshipsAndFlatComponents,
    summary="Get component by ID",
)
async def get_component(
    component_id: PositiveInt,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
) -> ComponentReadWithRelationshipsAndFlatComponents:
    """Fetch a component by its stable id."""
    product = await require_model(session, Product, component_id, loaders=PRODUCT_READ_DETAIL_RELATIONSHIPS)
    if product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail=f"ID {component_id} belongs to a base product; use /products/{{id}} instead.",
        )
    return to_component_read(product, ComponentReadWithRelationshipsAndFlatComponents, current_user)


@component_core_router.post(
    "/{component_id}/components",
    response_model=ComponentReadWithRecursiveComponents,
    status_code=201,
    summary="Create a nested component",
)
async def add_component_to_component(
    db_component: UserOwnedComponentDep,
    component: Annotated[
        ComponentCreateWithComponents,
        Body(openapi_examples=COMPONENT_CREATE_OPENAPI_EXAMPLES),
    ],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> ComponentReadWithRecursiveComponents:
    """Create a new component below an existing component."""
    created = await create_component(
        db=session,
        component=component,
        parent_product=db_component,
    )
    await session.refresh(created, attribute_names=["owner", "components"])
    return to_component_read(created, ComponentReadWithRecursiveComponents, current_user)


@component_core_router.patch(
    "/{component_id}",
    response_model=ComponentRead,
    summary="Update component",
)
async def update_component(
    component_update: ProductUpdate,
    db_component: UserOwnedComponentDep,
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> ComponentRead:
    """Update a component. Response is the lean :class:`ComponentRead` shape (no relationships)."""
    updated = await update_product_record(session, db_component.id, component_update)
    return to_component_read(updated, ComponentRead, current_user)


@component_core_router.delete(
    "/{component_id}",
    status_code=204,
    summary="Delete component",
)
async def delete_component(db_component: UserOwnedComponentDep, session: AsyncSessionDep) -> None:
    """Delete a component (cascades to its sub-components)."""
    await delete_product_record(session, db_component.id)
