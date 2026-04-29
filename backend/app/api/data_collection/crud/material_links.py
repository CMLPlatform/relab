"""Bill-of-materials CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.common.crud.associations import require_link
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.persistence import update_and_commit
from app.api.common.crud.utils import validate_linked_items_exist, validate_no_duplicate_linked_items
from app.api.common.exceptions import InternalServerError
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.exceptions import MaterialIDRequiredError
from app.api.data_collection.filters import MaterialProductLinkFilter
from app.api.data_collection.models.product import MaterialProductLink
from app.api.reference_data.models import Material

from .shared import get_material_links_for_product, get_product_with_bill_of_materials, validate_product_material_links

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


async def list_material_links_for_product(
    db: AsyncSession,
    *,
    product_id: int,
    material_filter: MaterialProductLinkFilter,
) -> Sequence[MaterialProductLink]:
    """List bill-of-material rows scoped to one product/component row."""
    statement: Select[tuple[MaterialProductLink]] = (
        select(MaterialProductLink).join(Material).where(MaterialProductLink.product_id == product_id)
    )
    statement = apply_filter(statement, MaterialProductLink, material_filter)
    return list((await db.execute(statement)).scalars().unique().all())


async def add_materials_to_product(
    db: AsyncSession, product_id: int, material_links: list[MaterialProductLinkCreateWithinProduct]
) -> list[MaterialProductLink]:
    """Add materials to a product."""
    material_ids: set[int] = {material_link.material_id for material_link in material_links}
    db_product, normalized_material_ids = await validate_product_material_links(db, product_id, material_ids)

    if db_product.bill_of_materials:
        validate_no_duplicate_linked_items(
            normalized_material_ids, db_product.bill_of_materials, "Materials", id_attr="material_id"
        )

    db_material_product_links: list[MaterialProductLink] = [
        MaterialProductLink(**material_link.model_dump(), product_id=product_id) for material_link in material_links
    ]
    db.add_all(db_material_product_links)
    await db.commit()
    for link in db_material_product_links:
        await db.refresh(link)

    return db_material_product_links


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
    await get_product_with_bill_of_materials(db, product_id)

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
    product, normalized_material_ids = await validate_product_material_links(db, product_id, material_ids)

    validate_linked_items_exist(normalized_material_ids, product.bill_of_materials, "Materials", id_attr="material_id")

    for material_link in await get_material_links_for_product(db, product_id, normalized_material_ids):
        await db.delete(material_link)

    await db.commit()
