"""Bill-of-materials CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import delete, select

from app.api.common.crud.associations import require_link
from app.api.common.crud.filtering import SUB_RESOURCE_LIMIT, apply_filter
from app.api.common.crud.persistence import update_and_commit
from app.api.common.crud.query import require_model, require_models
from app.api.common.crud.utils import validate_linked_items_exist, validate_no_duplicate_linked_items
from app.api.common.exceptions import InternalServerError
from app.api.data_collection.exceptions import MaterialIDRequiredError
from app.api.data_collection.filters import MaterialProductLinkFilter
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.data_collection.schemas import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.reference_data.models import Material

if TYPE_CHECKING:
    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


def _normalize_material_ids(material_ids: int | set[int]) -> set[int]:
    return {material_ids} if isinstance(material_ids, int) else material_ids


async def _get_product_with_bill_of_materials(db: AsyncSession, product_id: int) -> Product:
    return await require_model(db, Product, product_id, loaders={"bill_of_materials"})


async def _validate_product_material_links(
    db: AsyncSession,
    product_id: int,
    material_ids: int | set[int],
) -> tuple[Product, set[int]]:
    normalized = _normalize_material_ids(material_ids)
    product = await _get_product_with_bill_of_materials(db, product_id)
    await require_models(db, Material, normalized)
    return product, normalized


async def list_material_links_for_product(
    db: AsyncSession,
    *,
    product_id: int,
    material_filter: MaterialProductLinkFilter,
) -> list[MaterialProductLink]:
    """List bill-of-material rows scoped to one product/component row."""
    statement: Select[tuple[MaterialProductLink]] = (
        select(MaterialProductLink).join(Material).where(MaterialProductLink.product_id == product_id)
    )
    statement = apply_filter(statement, MaterialProductLink, material_filter)
    statement = statement.limit(SUB_RESOURCE_LIMIT)
    return list((await db.execute(statement)).scalars().unique().all())


async def add_materials_to_product(
    db: AsyncSession, product_id: int, material_links: list[MaterialProductLinkCreateWithinProduct]
) -> list[MaterialProductLink]:
    """Add materials to a product."""
    material_ids: set[int] = {material_link.material_id for material_link in material_links}
    db_product, normalized_material_ids = await _validate_product_material_links(db, product_id, material_ids)

    if db_product.bill_of_materials:
        validate_no_duplicate_linked_items(
            normalized_material_ids, db_product.bill_of_materials, "Materials", id_attr="material_id"
        )

    db_material_product_links: list[MaterialProductLink] = [
        MaterialProductLink(**material_link.model_dump(), product_id=product_id) for material_link in material_links
    ]
    db.add_all(db_material_product_links)
    await db.flush()
    link_ids = [link.id for link in db_material_product_links]
    await db.commit()

    result = await db.execute(select(MaterialProductLink).where(MaterialProductLink.id.in_(link_ids)))
    return list(result.scalars().all())


async def add_material_to_product(
    db: AsyncSession,
    product_id: int,
    material_link: MaterialProductLinkCreateWithinProduct | MaterialProductLinkCreateWithinProductAndMaterial,
    *,
    material_id: int | None = None,
) -> MaterialProductLink:
    """Add a material to a product."""
    if isinstance(material_link, MaterialProductLinkCreateWithinProductAndMaterial):
        if material_id is None:
            raise MaterialIDRequiredError

        material_link = MaterialProductLinkCreateWithinProduct(material_id=material_id, **material_link.model_dump())

    db_material_link_list: list[MaterialProductLink] = await add_materials_to_product(db, product_id, [material_link])

    if len(db_material_link_list) != 1:
        err_msg = (
            f"Database integrity error: Expected 1 material with id {material_link.material_id},"
            f" got {len(db_material_link_list)}"
        )
        raise InternalServerError(log_message=err_msg)

    return db_material_link_list[0]


async def update_material_within_product(
    db: AsyncSession, product_id: int, material_id: int, material_link: MaterialProductLinkUpdate
) -> MaterialProductLink:
    """Update material in a product bill of materials."""
    await _get_product_with_bill_of_materials(db, product_id)

    db_material_link: MaterialProductLink = await require_link(
        db,
        MaterialProductLink,
        product_id,
        material_id,
        MaterialProductLink.product_id,
        MaterialProductLink.material_id,
    )

    return await update_and_commit(db, db_material_link, material_link)


async def remove_materials_from_product(db: AsyncSession, product_id: int, material_ids: int | set[int]) -> None:
    """Remove materials from a product."""
    product, normalized_material_ids = await _validate_product_material_links(db, product_id, material_ids)

    validate_linked_items_exist(normalized_material_ids, product.bill_of_materials, "Materials", id_attr="material_id")

    await db.execute(
        delete(MaterialProductLink)
        .where(MaterialProductLink.product_id == product_id)
        .where(MaterialProductLink.material_id.in_(normalized_material_ids))
    )
    await db.commit()
