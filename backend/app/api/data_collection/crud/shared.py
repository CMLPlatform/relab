"""Shared helpers for data-collection CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from sqlmodel import col, select

from app.api.background_data.models import Material
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.persistence import SupportsModelDump, commit_and_refresh, delete_and_commit, update_and_commit
from app.api.common.crud.utils import get_models_by_ids_or_404
from app.api.data_collection.exceptions import ProductPropertyAlreadyExistsError, ProductPropertyNotFoundError
from app.api.data_collection.models.product import (
    CircularityProperties,
    MaterialProductLink,
    PhysicalProperties,
    Product,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession


async def get_product_with_relationship(
    db: AsyncSession,
    product_id: int,
    relationship_name: str,
) -> Product:
    """Fetch a product with one explicit relationship loaded."""
    return await get_model_by_id(db, Product, product_id, include_relationships={relationship_name})


def require_product_relationship[PropertyT: PhysicalProperties | CircularityProperties](
    product: Product,
    *,
    relationship_name: str,
    not_found_label: str,
) -> PropertyT:
    """Return a loaded one-to-one product relation or raise a consistent error."""
    db_property = cast("PropertyT | None", getattr(product, relationship_name))
    if db_property is None:
        raise ProductPropertyNotFoundError(not_found_label, product.id)
    return db_property


async def create_product_property[
    PropertyT: PhysicalProperties | CircularityProperties,
    CreateSchemaT: SupportsModelDump,
](
    db: AsyncSession,
    *,
    product_id: int,
    payload: CreateSchemaT,
    property_model: type[PropertyT],
    relationship_name: str,
    already_exists_label: str,
) -> PropertyT:
    """Create a one-to-one product property row if it does not already exist."""
    product = await get_product_with_relationship(db, product_id, relationship_name)
    if getattr(product, relationship_name):
        raise ProductPropertyAlreadyExistsError(product_id, already_exists_label)

    db_property = property_model(**payload.model_dump(), product_id=product_id)
    setattr(product, relationship_name, db_property)
    return await commit_and_refresh(db, db_property)


async def update_product_property[
    PropertyT: PhysicalProperties | CircularityProperties,
    UpdateSchemaT: SupportsModelDump,
](
    db: AsyncSession,
    *,
    product_id: int,
    payload: UpdateSchemaT,
    relationship_name: str,
    not_found_label: str,
) -> PropertyT:
    """Update a one-to-one product property row."""
    product = await get_product_with_relationship(db, product_id, relationship_name)
    db_property = require_product_relationship(
        product,
        relationship_name=relationship_name,
        not_found_label=not_found_label,
    )
    return await update_and_commit(db, db_property, payload)


async def delete_product_property(
    db: AsyncSession,
    *,
    product: Product,
    relationship_name: str,
    not_found_label: str,
) -> None:
    """Delete a one-to-one product property row."""
    db_property = require_product_relationship(
        product,
        relationship_name=relationship_name,
        not_found_label=not_found_label,
    )
    await delete_and_commit(db, db_property)


def normalize_material_ids(material_ids: int | set[int]) -> set[int]:
    """Normalize a single material ID into the set-based CRUD interface."""
    return {material_ids} if isinstance(material_ids, int) else material_ids


async def get_product_with_bill_of_materials(db: AsyncSession, product_id: int) -> Product:
    """Fetch a product with its bill of materials loaded."""
    return await get_model_by_id(db, Product, product_id, include_relationships={"bill_of_materials"})


async def validate_product_material_links(
    db: AsyncSession,
    product_id: int,
    material_ids: int | set[int],
) -> tuple[Product, set[int]]:
    """Validate that the product and referenced materials exist."""
    normalized_material_ids = normalize_material_ids(material_ids)
    product = await get_product_with_bill_of_materials(db, product_id)
    await get_models_by_ids_or_404(db, Material, normalized_material_ids)
    return product, normalized_material_ids


async def get_material_links_for_product(
    db: AsyncSession,
    product_id: int,
    material_ids: set[int],
) -> Sequence[MaterialProductLink]:
    """Fetch material-product links for a product and a set of material IDs."""
    statement = (
        select(MaterialProductLink)
        .where(col(MaterialProductLink.product_id) == product_id)
        .where(col(MaterialProductLink.material_id).in_(material_ids))
    )
    results = await db.exec(statement)
    return results.all()
