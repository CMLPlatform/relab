"""Shared helpers for data-collection CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.background_data.models import Material
from app.api.common.crud.query import require_model, require_models
from app.api.data_collection.models.product import (
    MaterialProductLink,
    Product,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy.ext.asyncio import AsyncSession


def normalize_material_ids(material_ids: int | set[int]) -> set[int]:
    """Normalize a single material ID into the set-based CRUD interface."""
    return {material_ids} if isinstance(material_ids, int) else material_ids


async def get_product_with_bill_of_materials(db: AsyncSession, product_id: int) -> Product:
    """Fetch a product with its bill of materials loaded."""
    return await require_model(db, Product, product_id, loaders={"bill_of_materials"})


async def validate_product_material_links(
    db: AsyncSession,
    product_id: int,
    material_ids: int | set[int],
) -> tuple[Product, set[int]]:
    """Validate that the product and referenced materials exist."""
    normalized_material_ids = normalize_material_ids(material_ids)
    product = await get_product_with_bill_of_materials(db, product_id)
    await require_models(db, Material, normalized_material_ids)
    return product, normalized_material_ids


async def get_material_links_for_product(
    db: AsyncSession,
    product_id: int,
    material_ids: set[int],
) -> Sequence[MaterialProductLink]:
    """Fetch material-product links for a product and a set of material IDs."""
    statement = (
        select(MaterialProductLink)
        .where(MaterialProductLink.product_id == product_id)
        .where(MaterialProductLink.material_id.in_(material_ids))
    )
    results = await db.execute(statement)
    return results.scalars().all()
