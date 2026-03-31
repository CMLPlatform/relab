"""Product tree CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from pydantic import UUID4
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import select

from app.api.background_data.models import Material, ProductType
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.crud.utils import get_models_by_ids_or_404
from app.api.data_collection.exceptions import ProductOwnerRequiredError, ProductTreeMissingContentError
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models.product import (
    CircularityProperties,
    MaterialProductLink,
    PhysicalProperties,
    Product,
)
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ProductCreateWithComponents,
    ProductUpdate,
    ProductUpdateWithProperties,
)
from app.api.file_storage.models import Video

from .properties import update_circularity_properties, update_physical_properties
from .storage import product_files_crud, product_images_crud

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlmodel.sql._expression_select_cls import SelectOfScalar


async def get_product_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    parent_id: int | None = None,
    product_filter: ProductFilterWithRelationships | None = None,
) -> Sequence[Product]:
    """Get product with their components up to specified depth."""
    if parent_id:
        await get_model_by_id(db, Product, parent_id)

    statement: SelectOfScalar[Product] = (
        select(Product)
        .where(Product.parent_id == parent_id)
        .options(
            selectinload(cast("QueryableAttribute[Any]", Product.components), recursion_depth=recursion_depth),
            selectinload(cast("QueryableAttribute[Any]", Product.product_type)),
            selectinload(cast("QueryableAttribute[Any]", Product.videos)),
            selectinload(cast("QueryableAttribute[Any]", Product.files)),
            selectinload(cast("QueryableAttribute[Any]", Product.images)),
        )
    )

    if product_filter:
        statement = product_filter.filter(statement)

    return list((await db.exec(statement)).all())


def product_payload(
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
) -> dict[str, Any]:
    """Return the shared payload used to create a product or component."""
    return product_data.model_dump(
        exclude={
            "components",
            "owner_id",
            "physical_properties",
            "circularity_properties",
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


def create_product_properties(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create one-to-one product property rows when present."""
    if product_data.physical_properties:
        db_physical_property = PhysicalProperties(**product_data.physical_properties.model_dump())
        db_physical_property.product = db_product
        db.add(db_physical_property)

    if product_data.circularity_properties:
        db_circularity_property = CircularityProperties(**product_data.circularity_properties.model_dump())
        db_circularity_property.product = db_product
        db.add(db_circularity_property)


def create_product_videos(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create video rows linked to the product."""
    if not product_data.videos:
        return

    if db_product.videos is None:
        db_product.videos = []

    for video in product_data.videos:
        db_video = Video(**video.model_dump())
        db_product.videos.append(db_video)
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
    await get_models_by_ids_or_404(db, Material, material_ids)

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
    if not product_data.bill_of_materials and not product_data.components:
        raise ProductTreeMissingContentError

    if owner_id is None:
        raise ProductOwnerRequiredError

    db_product = await create_product_record(db, product_data, owner_id=owner_id, parent_product=parent_product)
    create_product_properties(db, product_data, db_product)
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
    return await create_and_persist_product_tree(db, product, owner_id=owner_id)


async def update_product(
    db: AsyncSession, product_id: int, product: ProductUpdate | ProductUpdateWithProperties
) -> Product:
    """Update an existing product in the database."""
    db_product = await get_model_by_id(db, Product, product_id)

    if product.product_type_id:
        await get_model_by_id(db, ProductType, product.product_type_id)

    product_data: dict[str, Any] = product.model_dump(
        exclude_unset=True, exclude={"physical_properties", "circularity_properties"}
    )
    db_product.sqlmodel_update(product_data)

    if isinstance(product, ProductUpdateWithProperties):
        if product.physical_properties:
            await update_physical_properties(db, product_id, product.physical_properties)
        if product.circularity_properties:
            await update_circularity_properties(db, product_id, product.circularity_properties)

    return await commit_and_refresh(db, db_product)


async def delete_product(db: AsyncSession, product_id: int) -> None:
    """Delete a product from the database."""
    db_product = await get_model_by_id(db, Product, product_id)

    await product_files_crud.delete_all(db, product_id)
    await product_images_crud.delete_all(db, product_id)

    await db.delete(db_product)
    await db.commit()
