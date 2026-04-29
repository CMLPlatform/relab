"""Flat routes for components — stable URLs independent of tree depth.

Components share a table with base products, but they live at their own
stable resource path ``/components/{id}`` so clients never need to know a
parent (immediate or root) to address them. Parent scoping remains available
on ``/products/{id}/components`` for listing direct children. Nested
component creation uses ``POST /components/{id}/components``.

Media routes (files/images) are mounted under ``/components/{id}/…`` and
share handler bodies with the product-scoped equivalents via
``media_handlers``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Body, Depends, Form, HTTPException, Path, UploadFile
from fastapi import File as FastAPIFile
from fastapi_filter import FilterDepends
from pydantic import UUID4, BeforeValidator, PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep, OptionalCurrentActiveUserDep
from app.api.common.crud.associations import require_link
from app.api.common.crud.query import require_model
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkReadWithinProduct,
    MaterialProductLinkUpdate,
)
from app.api.common.schemas.base import ComponentRead
from app.api.data_collection.crud.material_links import (
    add_material_to_product as add_material_to_product_link,
)
from app.api.data_collection.crud.material_links import (
    add_materials_to_product as add_materials_to_product_links,
)
from app.api.data_collection.crud.material_links import (
    list_material_links_for_product,
    update_material_within_product,
)
from app.api.data_collection.crud.material_links import (
    remove_materials_from_product as remove_materials_from_product_links,
)
from app.api.data_collection.crud.products import (
    PRODUCT_READ_DETAIL_RELATIONSHIPS,
    create_component,
)
from app.api.data_collection.crud.products import (
    delete_product as delete_product_record,
)
from app.api.data_collection.crud.products import (
    update_product as update_product_record,
)
from app.api.data_collection.dependencies import (
    ComponentDep,
    MaterialProductLinkFilterDep,
    UserOwnedComponentDep,
    get_user_owned_component_id_from_component,
)
from app.api.data_collection.examples import (
    COMPONENT_CREATE_OPENAPI_EXAMPLES,
    PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES,
    PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
    PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES,
    PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES,
)
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.data_collection.presentation.product_reads import to_component_read
from app.api.data_collection.routers.media_handlers import (
    handle_delete_file,
    handle_delete_image,
    handle_get_file,
    handle_get_image,
    handle_list_files,
    handle_list_images,
    handle_upload_file,
    handle_upload_image,
)
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    ComponentReadWithRelationshipsAndFlatComponents,
    ProductUpdate,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import (
    FileReadWithinParent,
    ImageReadWithinParent,
    empty_str_to_none,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

component_router = PublicAPIRouter(prefix="/components", tags=["components"])


@component_router.get(
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


@component_router.post(
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


@component_router.patch(
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


@component_router.delete(
    "/{component_id}",
    status_code=204,
    summary="Delete component",
)
async def delete_component(db_component: UserOwnedComponentDep, session: AsyncSessionDep) -> None:
    """Delete a component (cascades to its sub-components)."""
    await delete_product_record(session, db_component.id)


### File routes (scoped to components) ###


@component_router.get(
    "/{component_id}/files",
    response_model=list[FileReadWithinParent],
    summary="List files attached to a component",
)
async def get_component_files(
    db_component: ComponentDep,
    session: AsyncSessionDep,
    item_filter: FileFilter = FilterDepends(FileFilter),
) -> list[FileReadWithinParent]:
    """List all files attached to a component."""
    return await handle_list_files(session, db_component.id, item_filter)


@component_router.get(
    "/{component_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get a specific component file",
)
async def get_component_file(
    db_component: ComponentDep,
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file attached to a component."""
    return await handle_get_file(session, db_component.id, file_id)


@component_router.post(
    "/{component_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    summary="Upload a file to a component",
)
async def upload_component_file(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for a component."""
    return await handle_upload_file(session, parent_id, file=file, description=description)


@component_router.delete(
    "/{component_id}/files/{file_id}",
    summary="Remove a file from a component",
    status_code=204,
)
async def delete_component_file(
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from a component."""
    await handle_delete_file(session, parent_id, file_id)


### Image routes (scoped to components) ###


@component_router.get(
    "/{component_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="List images attached to a component",
)
async def get_component_images(
    db_component: ComponentDep,
    session: AsyncSessionDep,
    item_filter: ImageFilter = FilterDepends(ImageFilter),
) -> list[ImageReadWithinParent]:
    """List all images attached to a component."""
    return await handle_list_images(session, db_component.id, item_filter)


@component_router.get(
    "/{component_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get a specific component image",
)
async def get_component_image(
    db_component: ComponentDep,
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image attached to a component."""
    return await handle_get_image(session, db_component.id, image_id)


@component_router.post(
    "/{component_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    summary="Upload an image to a component",
)
async def upload_component_image(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
    current_user: CurrentActiveVerifiedUserDep,
    description: Annotated[str | None, Form()] = None,
    image_metadata: Annotated[
        str | None,
        Form(
            description="Image metadata in JSON string format",
            openapi_examples=IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES,
        ),
        BeforeValidator(empty_str_to_none),
    ] = None,
) -> ImageReadWithinParent:
    """Upload a new image for a component."""
    return await handle_upload_image(
        session,
        parent_id,
        file=file,
        description=description,
        image_metadata=image_metadata,
        current_user=current_user,
    )


@component_router.delete(
    "/{component_id}/images/{image_id}",
    summary="Remove an image from a component",
    status_code=204,
)
async def delete_component_image(
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from a component."""
    await handle_delete_image(session, parent_id, image_id)


### Material routes (scoped to components) ###


@component_router.get(
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


@component_router.get(
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


@component_router.post(
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


@component_router.post(
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


@component_router.patch(
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


@component_router.delete(
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


@component_router.delete(
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
