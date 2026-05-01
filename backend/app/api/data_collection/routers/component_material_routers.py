"""Component-scoped bill-of-materials routes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Body, Path
from pydantic import PositiveInt

from app.api.common.crud.associations import require_link
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkReadWithinProduct,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.crud.material_links import (
    add_material_to_product as add_material_to_product_link,
)
from app.api.data_collection.crud.material_links import (
    add_materials_to_product as add_materials_to_product_links,
)
from app.api.data_collection.crud.material_links import list_material_links_for_product, update_material_within_product
from app.api.data_collection.crud.material_links import (
    remove_materials_from_product as remove_materials_from_product_links,
)
from app.api.data_collection.dependencies import ComponentDep, MaterialProductLinkFilterDep, UserOwnedComponentDep
from app.api.data_collection.examples import (
    PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES,
    PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
    PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES,
    PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES,
)
from app.api.data_collection.models.product import MaterialProductLink

if TYPE_CHECKING:
    from collections.abc import Sequence

component_material_router = PublicAPIRouter(prefix="/components", tags=["components"])


@component_material_router.get(
    "/{component_id}/materials",
    response_model=list[MaterialProductLinkReadWithinProduct],
    summary="Get component bill of materials",
)
async def get_component_bill_of_materials(
    session: AsyncSessionDep,
    component: ComponentDep,
    material_filter: MaterialProductLinkFilterDep,
) -> Sequence[MaterialProductLink]:
    """Get bill of materials for a component."""
    return await list_material_links_for_product(session, product_id=component.id, material_filter=material_filter)


@component_material_router.get(
    "/{component_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Get material in component bill of materials",
)
async def get_material_in_component_bill_of_materials(
    component: ComponentDep,
    material_id: PositiveInt,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Get a material in a component's bill of materials."""
    return await require_link(
        session,
        MaterialProductLink,
        component.id,
        material_id,
        MaterialProductLink.product_id,
        MaterialProductLink.material_id,
    )


@component_material_router.post(
    "/{component_id}/materials",
    response_model=list[MaterialProductLinkReadWithinProduct],
    status_code=201,
    summary="Add multiple materials to component bill of materials",
)
async def add_materials_to_component(
    component: UserOwnedComponentDep,
    materials: Annotated[
        list[MaterialProductLinkCreateWithinProduct],
        Body(
            description="List of materials-component links to add to the component",
            openapi_examples=PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> list[MaterialProductLink]:
    """Add multiple materials to a component's bill of materials."""
    return await add_materials_to_product_links(session, component.id, materials)


@component_material_router.post(
    "/{component_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    status_code=201,
    summary="Add single material to component bill of materials",
)
async def add_material_to_component(
    component: UserOwnedComponentDep,
    material_id: Annotated[
        PositiveInt,
        Path(
            description="ID of material to add to the component",
            openapi_examples=PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES,
        ),
    ],
    material_link: Annotated[
        MaterialProductLinkCreateWithinProductAndMaterial,
        Body(
            description="Material-component link details",
            openapi_examples=PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Add a single material to a component's bill of materials."""
    return await add_material_to_product_link(session, component.id, material_link, material_id=material_id)


@component_material_router.patch(
    "/{component_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Update material in component bill of materials",
)
async def update_component_bill_of_materials(
    component: UserOwnedComponentDep,
    material_id: PositiveInt,
    material: MaterialProductLinkUpdate,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Update material in bill of materials for a component."""
    return await update_material_within_product(session, component.id, material_id, material)


@component_material_router.delete(
    "/{component_id}/materials/{material_id}",
    status_code=204,
    summary="Remove single material from component bill of materials",
)
async def remove_material_from_component(
    component: UserOwnedComponentDep,
    material_id: Annotated[
        PositiveInt,
        Path(description="ID of material to remove from the component"),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove a single material from a component's bill of materials."""
    await remove_materials_from_product_links(session, component.id, {material_id})


@component_material_router.delete(
    "/{component_id}/materials",
    status_code=204,
    summary="Remove multiple materials from component bill of materials",
)
async def remove_materials_from_component_bulk(
    component: UserOwnedComponentDep,
    material_ids: Annotated[
        set[PositiveInt],
        Body(
            description="Material IDs to remove from the component",
            default_factory=set,
            openapi_examples=PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove multiple materials from a component's bill of materials."""
    await remove_materials_from_product_links(session, component.id, material_ids)
