"""Product property CRUD operations."""

from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.data_collection.models.product import CircularityProperties, PhysicalProperties, Product
from app.api.data_collection.schemas import (
    CircularityPropertiesCreate,
    CircularityPropertiesUpdate,
    PhysicalPropertiesCreate,
    PhysicalPropertiesUpdate,
)

from .shared import (
    create_product_property,
    delete_product_property,
    get_product_with_relationship,
    require_product_relationship,
    update_product_property,
)


async def get_physical_properties(db: AsyncSession, product_id: int) -> PhysicalProperties:
    """Get physical properties for a product."""
    product = await get_product_with_relationship(db, product_id, "physical_properties")
    return require_product_relationship(
        product,
        relationship_name="physical_properties",
        not_found_label="Physical properties",
    )


async def create_physical_properties(
    db: AsyncSession,
    physical_properties: PhysicalPropertiesCreate,
    product_id: int,
) -> PhysicalProperties:
    """Create physical properties for a product."""
    return await create_product_property(
        db,
        product_id=product_id,
        payload=physical_properties,
        property_model=PhysicalProperties,
        relationship_name="physical_properties",
        already_exists_label="physical properties",
    )


async def update_physical_properties(
    db: AsyncSession, product_id: int, physical_properties: PhysicalPropertiesUpdate
) -> PhysicalProperties:
    """Update physical properties for a product."""
    return await update_product_property(
        db,
        product_id=product_id,
        payload=physical_properties,
        relationship_name="physical_properties",
        not_found_label="Physical properties",
    )


async def delete_physical_properties(db: AsyncSession, product: Product) -> None:
    """Delete physical properties for a product."""
    await delete_product_property(
        db,
        product=product,
        relationship_name="physical_properties",
        not_found_label="Physical properties",
    )


async def get_circularity_properties(db: AsyncSession, product_id: int) -> CircularityProperties:
    """Get circularity properties for a product."""
    product = await get_product_with_relationship(db, product_id, "circularity_properties")
    return require_product_relationship(
        product,
        relationship_name="circularity_properties",
        not_found_label="Circularity properties",
    )


async def create_circularity_properties(
    db: AsyncSession,
    circularity_properties: CircularityPropertiesCreate,
    product_id: int,
) -> CircularityProperties:
    """Create circularity properties for a product."""
    return await create_product_property(
        db,
        product_id=product_id,
        payload=circularity_properties,
        property_model=CircularityProperties,
        relationship_name="circularity_properties",
        already_exists_label="circularity properties",
    )


async def update_circularity_properties(
    db: AsyncSession, product_id: int, circularity_properties: CircularityPropertiesUpdate
) -> CircularityProperties:
    """Update circularity properties for a product."""
    return await update_product_property(
        db,
        product_id=product_id,
        payload=circularity_properties,
        relationship_name="circularity_properties",
        not_found_label="Circularity properties",
    )


async def delete_circularity_properties(db: AsyncSession, product: Product) -> None:
    """Delete circularity properties for a product."""
    await delete_product_property(
        db,
        product=product,
        relationship_name="circularity_properties",
        not_found_label="Circularity properties",
    )
