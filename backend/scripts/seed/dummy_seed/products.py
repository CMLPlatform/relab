"""Dummy product seeding."""

from __future__ import annotations

import logging
from itertools import cycle
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.common.models.enums import Unit
from app.api.common.schemas.associations import MaterialProductLinkCreateWithinProduct
from app.api.data_collection.crud.products import create_product
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import ProductCreateWithComponents
from app.api.reference_data.models import Material, ProductType

from .data import product_data

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from typing import Any


def normalize_unit(raw_unit: object, product_name: str) -> Unit:
    """Convert seed data unit values to a valid Unit enum."""
    if not isinstance(raw_unit, str):
        return Unit.KILOGRAM

    try:
        return Unit(raw_unit)
    except ValueError:
        try:
            return Unit[raw_unit.upper()]
        except KeyError:
            logger.warning("Unknown unit '%s' for %s, defaulting to kilogram.", raw_unit, product_name)
            return Unit.KILOGRAM


def build_bill_of_materials(
    material_map: dict[str, Material], bom_data: list[dict[str, Any]], product_name: str
) -> list[MaterialProductLinkCreateWithinProduct]:
    """Construct a BOM list for a product from seed data."""
    bill: list[MaterialProductLinkCreateWithinProduct] = []
    for mdata in bom_data:
        mat = material_map.get(mdata["material"])
        if not mat or mat.id is None:
            logger.warning("Skipping material link for %s: material %s not found.", product_name, mdata)
            continue
        bill.append(
            MaterialProductLinkCreateWithinProduct(
                material_id=mat.id,
                quantity=mdata["quantity"],
                unit=normalize_unit(mdata.get("unit"), product_name),
            )
        )
    return bill


async def get_existing_product_id(session: AsyncSession, name: str) -> int | None:
    """Return existing product id for a given name, or None."""
    stmt = select(Product.id, Product.name).where(Product.name == name)
    row = (await session.execute(stmt)).first()
    if not row:
        return None
    existing_id, _ = row
    return int(existing_id) if existing_id is not None else None


def build_product_create_from_data(
    data: dict[str, Any], product_type_id: int, bill_of_materials: list[MaterialProductLinkCreateWithinProduct]
) -> ProductCreateWithComponents:
    """Build ProductCreateWithComponents from seed data dict."""
    physical_props = data.get("physical_properties", {})
    return ProductCreateWithComponents(
        name=data["name"],
        description=data["description"],
        brand=data["brand"],
        model=data["model"],
        product_type_id=product_type_id,
        weight_g=physical_props.get("weight_g"),
        height_cm=physical_props.get("height_cm"),
        width_cm=physical_props.get("width_cm"),
        depth_cm=physical_props.get("depth_cm"),
        bill_of_materials=bill_of_materials,
    )


async def seed_products(
    session: AsyncSession,
    product_type_map: dict[str, ProductType],
    material_map: dict[str, Material],
    user_map: dict[str, User],
) -> dict[str, int]:
    """Seed the database with sample product data."""
    product_id_map: dict[str, int] = {}
    users = [u for u in user_map.values() if u and getattr(u, "id", None) is not None]
    if not users:
        logger.warning("No users available for product seeding; skipping.")
        return product_id_map
    user_cycle = cycle(users)

    for data in product_data:
        if data["name"] in product_id_map:
            continue

        existing_id = await get_existing_product_id(session, data["name"])
        if existing_id is not None:
            product_id_map[data["name"]] = existing_id
            continue

        product_type = product_type_map.get(data["product_type_name"])
        if not product_type or product_type.id is None:
            continue

        user = next(user_cycle)

        physical_properties_data = data.get("physical_properties")
        bill_of_materials_data = data.get("bill_of_materials", [])

        if not physical_properties_data:
            logger.warning("Skipping product %s: missing physical properties.", data["name"])
            continue

        bill_of_materials = build_bill_of_materials(material_map, bill_of_materials_data, data["name"])

        product_create = build_product_create_from_data(data, int(product_type.id), bill_of_materials)
        product = await create_product(session, product_create, owner_id=user.id)

        if product.id:
            product_id_map[product.name] = product.id
    return product_id_map
