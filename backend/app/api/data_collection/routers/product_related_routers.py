"""Routers for product-related resources like properties, videos, and materials."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Body, Path
from fastapi_filter import FilterDepends
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.background_data.models import Material
from app.api.common.crud.associations import require_link
from app.api.common.crud.query import list_models, require_model
from app.api.common.crud.scopes import require_scoped_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkReadWithinProduct,
    MaterialProductLinkUpdate,
)
from app.api.data_collection import crud
from app.api.data_collection.dependencies import MaterialProductLinkFilterDep, ProductByIDDep, UserOwnedProductDep
from app.api.data_collection.examples import (
    PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES,
    PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
    PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES,
    PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES,
)
from app.api.data_collection.models.product import (
    MaterialProductLink,
    Product,
)
from app.api.file_storage.crud.video import create_video, delete_video, update_video
from app.api.file_storage.filters import VideoFilter
from app.api.file_storage.models import Video
from app.api.file_storage.schemas import VideoCreateWithinProduct, VideoReadWithinProduct, VideoUpdateWithinProduct

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select

product_related_router = PublicAPIRouter(prefix="/products", tags=["products"])


@product_related_router.get(
    "/{product_id}/videos",
    response_model=list[VideoReadWithinProduct],
    summary="Get all videos for a product",
)
async def get_product_videos(
    session: AsyncSessionDep,
    product: ProductByIDDep,
    video_filter: VideoFilter = FilterDepends(VideoFilter),
) -> Sequence[Video]:
    """Get all videos associated with a specific product."""
    statement: Select[tuple[Video]] = select(Video).where(Video.product_id == product.id)
    return await list_models(
        session,
        Video,
        filters=video_filter,
        statement=statement,
    )


@product_related_router.get(
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
    return await require_scoped_model(session, Product, product_id, Video, video_id, "product_id")


@product_related_router.post(
    "/{product_id}/videos",
    response_model=VideoReadWithinProduct,
    status_code=201,
    summary="Create a new video for a product",
)
async def create_product_video(
    product: UserOwnedProductDep,
    video: VideoCreateWithinProduct,
    session: AsyncSessionDep,
) -> Video:
    """Create a new video associated with a specific product."""
    return await create_video(session, video, product_id=product.id)


@product_related_router.patch(
    "/{product_id}/videos/{video_id}",
    response_model=VideoReadWithinProduct,
    summary="Update video by ID",
)
async def update_product_video(
    product: UserOwnedProductDep,
    video_id: PositiveInt,
    video_update: VideoUpdateWithinProduct,
    session: AsyncSessionDep,
) -> Video:
    """Update a video associated with a specific product."""
    await require_scoped_model(session, Product, product.id, Video, video_id, "product_id")
    return await update_video(session, video_id, video_update)


@product_related_router.delete(
    "/{product_id}/videos/{video_id}",
    status_code=204,
    summary="Delete video by ID",
)
async def delete_product_video(product: UserOwnedProductDep, video_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a video associated with a specific product."""
    await require_scoped_model(session, Product, product.id, Video, video_id, "product_id")
    await delete_video(session, video_id)


@product_related_router.get(
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
    await require_model(session, Product, product_id)
    statement: Select[tuple[MaterialProductLink]] = (
        select(MaterialProductLink).join(Material).where(MaterialProductLink.product_id == product_id)
    )
    return await list_models(
        session,
        MaterialProductLink,
        filters=material_filter,
        statement=statement,
    )


@product_related_router.get(
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
    return await require_link(
        session,
        MaterialProductLink,
        product_id,
        material_id,
        MaterialProductLink.product_id,
        MaterialProductLink.material_id,
    )


@product_related_router.post(
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
            openapi_examples=PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> list[MaterialProductLink]:
    """Add multiple materials to a product's bill of materials."""
    return await crud.add_materials_to_product(session, product.id, materials)


@product_related_router.post(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    status_code=201,
    summary="Add single material to product bill of materials",
)
async def add_material_to_product(
    product: UserOwnedProductDep,
    material_id: Annotated[
        PositiveInt,
        Path(
            description="ID of material to add to the product",
            openapi_examples=PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES,
        ),
    ],
    material_link: Annotated[
        MaterialProductLinkCreateWithinProductAndMaterial,
        Body(
            description="Material-product link details",
            openapi_examples=PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Add a single material to a product's bill of materials."""
    return await crud.add_material_to_product(session, product.id, material_link, material_id=material_id)


@product_related_router.patch(
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


@product_related_router.delete(
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


@product_related_router.delete(
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
            openapi_examples=PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove multiple materials from a product's bill of materials."""
    await crud.remove_materials_from_product(session, product.id, material_ids)
