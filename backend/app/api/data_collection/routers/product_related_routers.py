"""Routers for product-related resources like videos and materials."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Body, Depends, Path
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.common.crud.associations import require_link
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.filtering import apply_filter, create_filter_dependency
from app.api.common.crud.query import require_model
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
from app.api.data_collection.crud.material_links import (
    list_material_links_for_product,
    update_material_within_product,
)
from app.api.data_collection.crud.material_links import (
    remove_materials_from_product as remove_materials_from_product_links,
)
from app.api.data_collection.dependencies import BaseProductDep, MaterialProductLinkFilterDep, UserOwnedBaseProductDep
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
_VIDEO_FILTER_DEPENDENCY = create_filter_dependency(VideoFilter)


async def _load_product_video(session: AsyncSessionDep, *, product_id: PositiveInt, video_id: PositiveInt) -> Video:
    """Load one video scoped to a product."""
    video = await require_model(session, Video, video_id)
    if video.product_id != product_id:
        raise DependentModelOwnershipError(Video, video_id, Product, product_id)
    return video


async def _list_product_videos(
    session: AsyncSessionDep,
    *,
    product_id: PositiveInt,
    video_filter: VideoFilter,
) -> Sequence[Video]:
    """List videos scoped to one product."""
    statement: Select[tuple[Video]] = select(Video).where(Video.product_id == product_id)
    statement = apply_filter(statement, Video, video_filter)
    return list((await session.execute(statement)).scalars().unique().all())


@product_related_router.get(
    "/{product_id}/videos",
    response_model=list[VideoReadWithinProduct],
    summary="Get all videos for a base product",
)
async def get_product_videos(
    session: AsyncSessionDep,
    product: BaseProductDep,
    video_filter: VideoFilter = Depends(_VIDEO_FILTER_DEPENDENCY),
) -> Sequence[Video]:
    """Get all videos associated with a base product.

    Videos live only on base products (dismantling captures whole products,
    not components). Component ids are rejected.
    """
    return await _list_product_videos(session, product_id=product.id, video_filter=video_filter)


@product_related_router.get(
    "/{product_id}/videos/{video_id}",
    response_model=VideoReadWithinProduct,
    summary="Get video by ID",
)
async def get_product_video(
    product: BaseProductDep,
    video_id: PositiveInt,
    session: AsyncSessionDep,
) -> Video:
    """Get a video associated with a base product."""
    return await _load_product_video(session, product_id=product.id, video_id=video_id)


@product_related_router.post(
    "/{product_id}/videos",
    response_model=VideoReadWithinProduct,
    status_code=201,
    summary="Create a new video for a base product",
)
async def create_product_video(
    product: UserOwnedBaseProductDep,
    video: VideoCreateWithinProduct,
    session: AsyncSessionDep,
) -> Video:
    """Create a new video associated with a base product."""
    return await create_video(session, video, product_id=product.id)


@product_related_router.patch(
    "/{product_id}/videos/{video_id}",
    response_model=VideoReadWithinProduct,
    summary="Update video by ID",
)
async def update_product_video(
    product: UserOwnedBaseProductDep,
    video_id: PositiveInt,
    video_update: VideoUpdateWithinProduct,
    session: AsyncSessionDep,
) -> Video:
    """Update a video associated with a base product."""
    await _load_product_video(session, product_id=product.id, video_id=video_id)
    return await update_video(session, video_id, video_update)


@product_related_router.delete(
    "/{product_id}/videos/{video_id}",
    status_code=204,
    summary="Delete video by ID",
)
async def delete_product_video(
    product: UserOwnedBaseProductDep,
    video_id: PositiveInt,
    session: AsyncSessionDep,
) -> None:
    """Delete a video associated with a base product."""
    await _load_product_video(session, product_id=product.id, video_id=video_id)
    await delete_video(session, video_id)


@product_related_router.get(
    "/{product_id}/materials",
    response_model=list[MaterialProductLinkReadWithinProduct],
    summary="Get product bill of materials",
)
async def get_product_bill_of_materials(
    session: AsyncSessionDep,
    product: BaseProductDep,
    material_filter: MaterialProductLinkFilterDep,
) -> Sequence[MaterialProductLink]:
    """Get bill of materials for a base product."""
    return await list_material_links_for_product(session, product_id=product.id, material_filter=material_filter)


@product_related_router.get(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Get material in product bill of materials",
)
async def get_material_in_product_bill_of_materials(
    product: BaseProductDep,
    material_id: PositiveInt,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Get a material in a base product's bill of materials."""
    return await require_link(
        session,
        MaterialProductLink,
        product.id,
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
    product: UserOwnedBaseProductDep,
    materials: Annotated[
        list[MaterialProductLinkCreateWithinProduct],
        Body(
            description="List of materials-product links to add to the product",
            openapi_examples=PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES,
        ),
    ],
    session: AsyncSessionDep,
) -> list[MaterialProductLink]:
    """Add multiple materials to a base product's bill of materials."""
    return await add_materials_to_product_links(session, product.id, materials)


@product_related_router.post(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    status_code=201,
    summary="Add single material to product bill of materials",
)
async def add_material_to_product(
    product: UserOwnedBaseProductDep,
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
    """Add a single material to a base product's bill of materials."""
    return await add_material_to_product_link(session, product.id, material_link, material_id=material_id)


@product_related_router.patch(
    "/{product_id}/materials/{material_id}",
    response_model=MaterialProductLinkReadWithinProduct,
    summary="Update material in product bill of materials",
)
async def update_product_bill_of_materials(
    product: UserOwnedBaseProductDep,
    material_id: PositiveInt,
    material: MaterialProductLinkUpdate,
    session: AsyncSessionDep,
) -> MaterialProductLink:
    """Update material in bill of materials for a base product."""
    return await update_material_within_product(session, product.id, material_id, material)


@product_related_router.delete(
    "/{product_id}/materials/{material_id}",
    status_code=204,
    summary="Remove single material from product bill of materials",
)
async def remove_material_from_product(
    product: UserOwnedBaseProductDep,
    material_id: Annotated[
        PositiveInt,
        Path(description="ID of material to remove from the product"),
    ],
    session: AsyncSessionDep,
) -> None:
    """Remove a single material from a base product's bill of materials."""
    await remove_materials_from_product_links(session, product.id, {material_id})


@product_related_router.delete(
    "/{product_id}/materials",
    status_code=204,
    summary="Remove multiple materials from product bill of materials",
)
async def remove_materials_from_product_bulk(
    product: UserOwnedBaseProductDep,
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
    """Remove multiple materials from a base product's bill of materials."""
    await remove_materials_from_product_links(session, product.id, material_ids)
