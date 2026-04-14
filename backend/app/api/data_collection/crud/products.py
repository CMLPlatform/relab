"""Product tree CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from pydantic import UUID4
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute

from app.api.auth.services.stats import recompute_user_stats
from app.api.background_data.models import Material, ProductType
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.crud.query import require_model, require_models
from app.api.data_collection.crud.storage import product_files_crud, product_images_crud
from app.api.data_collection.exceptions import ProductOwnerRequiredError
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models.product import (
    MaterialProductLink,
    Product,
)
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ProductCreateWithComponents,
    ProductUpdate,
)
from app.api.file_storage.models import Video

PRODUCT_READ_SUMMARY_RELATIONSHIPS: frozenset[str] = frozenset({"owner"})
PRODUCT_READ_DETAIL_RELATIONSHIPS: frozenset[str] = frozenset(
    {"owner", "product_type", "videos", "files", "images", "bill_of_materials", "components"}
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


async def get_product_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    parent_id: int | None = None,
    product_filter: ProductFilterWithRelationships | None = None,
) -> Sequence[Product]:
    """Get product with their components up to specified depth."""
    if parent_id:
        await require_model(db, Product, parent_id)

    statement: Select[tuple[Product]] = (
        select(Product)
        .where(Product.parent_id == parent_id)
        .options(
            selectinload(cast("QueryableAttribute[Any]", Product.components), recursion_depth=recursion_depth),
            selectinload(cast("QueryableAttribute[Any]", Product.owner)),
            selectinload(cast("QueryableAttribute[Any]", Product.product_type)),
            selectinload(cast("QueryableAttribute[Any]", Product.videos)),
            selectinload(cast("QueryableAttribute[Any]", Product.files)),
            selectinload(cast("QueryableAttribute[Any]", Product.images)),
            selectinload(cast("QueryableAttribute[Any]", Product.bill_of_materials)),
        )
    )

    if product_filter:
        statement = product_filter.filter(statement)

    return list((await db.execute(statement)).scalars().all())


def product_payload(
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
) -> dict[str, Any]:
    """Return the shared payload used to create a product or component."""
    return product_data.model_dump(
        exclude={
            "components",
            "owner_id",
            "videos",
            "bill_of_materials",
        }
    )


async def create_product_record(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4,
    parent_product: Product | None = None,
) -> Product:
    """Create the base Product row and flush it so dependent rows can reference it."""
    db_product = Product(
        **product_payload(product_data),
        owner_id=owner_id,
        parent=parent_product,
    )
    db.add(db_product)
    await db.flush()
    return db_product


def create_product_videos(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create video rows linked to the product."""
    if not product_data.videos:
        return

    videos: list[Video] = db_product.videos if db_product.videos is not None else []
    db_product.videos = videos
    for video in product_data.videos:
        db_video = Video(**video.model_dump())
        videos.append(db_video)
        db.add(db_video)


async def create_product_bill_of_materials(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create bill-of-materials rows linked to the product."""
    if not product_data.bill_of_materials:
        return

    material_ids = {material.material_id for material in product_data.bill_of_materials}
    await require_models(db, Material, material_ids)

    db.add_all(
        MaterialProductLink(**material.model_dump(), product=db_product) for material in product_data.bill_of_materials
    )


async def create_product_components(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4,
    db_product: Product,
) -> None:
    """Recursively create child components for a product."""
    for component in product_data.components:
        await create_product_tree(db, component, owner_id=owner_id, parent_product=db_product)


async def create_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None = None,
    parent_product: Product | None = None,
) -> Product:
    """Create an in-memory product tree and flush rows for persistence."""
    if owner_id is None:
        raise ProductOwnerRequiredError

    db_product = await create_product_record(db, product_data, owner_id=owner_id, parent_product=parent_product)
    create_product_videos(db, product_data, db_product)
    await create_product_bill_of_materials(db, product_data, db_product)
    await create_product_components(db, product_data, owner_id=owner_id, db_product=db_product)

    return db_product


async def create_and_persist_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None,
    parent_product: Product | None = None,
) -> Product:
    """Create a product tree and persist the root row."""
    db_product = await create_product_tree(db, product_data, owner_id=owner_id, parent_product=parent_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def create_component(
    db: AsyncSession,
    component: ComponentCreateWithComponents,
    parent_product: Product,
) -> Product:
    """Add a component to a product."""
    return await create_and_persist_product_tree(
        db,
        component,
        owner_id=parent_product.owner_id,
        parent_product=parent_product,
    )


async def create_product(
    db: AsyncSession,
    product: ProductCreateWithComponents,
    owner_id: UUID4 | None,
) -> Product:
    """Create a new product in the database."""
    db_product = await create_and_persist_product_tree(db, product, owner_id=owner_id)
    if owner_id:
        await recompute_user_stats(db, owner_id)
        await db.commit()
    return db_product


async def update_product(db: AsyncSession, product_id: int, product: ProductUpdate) -> Product:
    """Update an existing product in the database."""
    db_product = await require_model(db, Product, product_id)

    if product.product_type_id:
        await require_model(db, ProductType, product.product_type_id)

    product_data: dict[str, Any] = product.model_dump(exclude_unset=True)
    for key, value in product_data.items():
        setattr(db_product, key, value)

    res = await commit_and_refresh(db, db_product)
    if db_product.owner_id is not None:
        await recompute_user_stats(db, db_product.owner_id)
        await db.commit()
    return res


async def delete_product(db: AsyncSession, product_id: int) -> None:
    """Delete a product from the database."""
    db_product = await require_model(db, Product, product_id)

    await product_files_crud.delete_all(db, product_id)
    await product_images_crud.delete_all(db, product_id)

    owner_id = db_product.owner_id
    await db.delete(db_product)
    await db.commit()
    if owner_id is not None:
        await recompute_user_stats(db, owner_id)
        await db.commit()
