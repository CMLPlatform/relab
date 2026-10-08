"""Command helpers for product creation, mutation, and deletion."""

from typing import TYPE_CHECKING, Any

from app.api.common.audit import AuditAction, audit_event
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.crud.query import require_locked_model, require_model, require_models
from app.api.data_collection.crud.product_tree_queries import MAX_COMPONENT_DEPTH, component_depth
from app.api.data_collection.crud.profile_stats import recompute_user_profile_stats
from app.api.data_collection.crud.storage import (
    cleanup_product_media_storage,
    delete_product_media,
    delete_product_rows,
    product_subtree_ids,
)
from app.api.data_collection.exceptions import (
    ProductOwnerRequiredError,
    ProductTreeTooDeepError,
    ProductVersionMismatchError,
)
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.data_collection.schemas import ComponentCreateWithComponents, ProductCreateWithComponents, ProductUpdate
from app.api.file_storage.models import Video
from app.api.file_storage.upload_quota import recompute_user_upload_quota
from app.api.reference_data.models import Material, ProductType

if TYPE_CHECKING:
    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession


def build_product_tree(
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4,
    parent_product: Product | None = None,
) -> Product:
    """Build the product, its videos, bill of materials and components in memory.

    ``owner_id`` is stored on every row: components denormalize their root base
    product's owner so downstream queries (ownership, stats, per-user listings) stay
    single-table, single-filter.
    """
    db_product = Product(
        **product_data.model_dump(exclude={"components", "owner_id", "videos", "bill_of_materials"}),
        owner_id=owner_id,
        parent=parent_product,
    )
    if isinstance(product_data, ProductCreateWithComponents) and product_data.videos:
        db_product.videos = [Video(**v.model_dump()) for v in product_data.videos]
    if product_data.bill_of_materials:
        db_product.bill_of_materials = [MaterialProductLink(**m.model_dump()) for m in product_data.bill_of_materials]
    for component in product_data.components:
        build_product_tree(component, owner_id=owner_id, parent_product=db_product)
    return db_product


def _tree_material_ids(product_data: ProductCreateWithComponents | ComponentCreateWithComponents) -> set[int]:
    """Collect the material ids named anywhere in a create payload's tree."""
    ids = {material.material_id for material in product_data.bill_of_materials}
    for component in product_data.components:
        ids |= _tree_material_ids(component)
    return ids


async def create_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None = None,
    parent_product: Product | None = None,
) -> Product:
    """Create a product tree and flush its rows.

    The tree's material ids are checked in one query and the rows flushed once, so
    the query count does not grow with the number of components.
    """
    if owner_id is None:
        raise ProductOwnerRequiredError

    if material_ids := _tree_material_ids(product_data):
        await require_models(db, Material, material_ids)
    db_product = build_product_tree(product_data, owner_id=owner_id, parent_product=parent_product)
    db.add(db_product)
    await db.flush()
    return db_product


async def create_and_persist_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None,
    parent_product: Product | None = None,
) -> Product:
    """Create a product tree and persist the root row.

    Refuses, before writing anything, a tree that would nest components deeper than
    ``MAX_COMPONENT_DEPTH`` below its base product, counting the new nested components too.
    """
    depth = 0 if parent_product is None else await component_depth(db, parent_product.id) + 1
    level = list(product_data.components)
    while level and depth <= MAX_COMPONENT_DEPTH:
        depth += 1
        level = [child for component in level for child in component.components]
    if depth > MAX_COMPONENT_DEPTH:
        raise ProductTreeTooDeepError(MAX_COMPONENT_DEPTH)
    db_product = await create_product_tree(db, product_data, owner_id=owner_id, parent_product=parent_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def create_component(
    db: AsyncSession,
    component: ComponentCreateWithComponents,
    parent_product: Product,
) -> Product:
    """Add a component to a product (denormalized owner_id inherited from the parent)."""
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
        await recompute_user_profile_stats(db, owner_id)
        await db.commit()
    return db_product


async def validate_product_type(db: AsyncSession, product_type_id: int | None) -> None:
    """Validate the referenced product type when one was provided."""
    if product_type_id is not None:
        await require_model(db, ProductType, product_type_id)


def apply_product_update(db_product: Product, product: ProductUpdate) -> None:
    """Apply the provided mutable product fields to an existing row."""
    product_data: dict[str, Any] = product.model_dump(exclude_unset=True)
    for key, value in product_data.items():
        setattr(db_product, key, value)


async def update_product(
    db: AsyncSession, product_id: int, product: ProductUpdate, *, if_match_version: int, user_id: UUID4
) -> Product:
    """Update an existing product, refusing the edit if it changed since the client read it.

    Under the row lock, an update that changes a field must name the stored version, and
    bumps it. An update that changes nothing succeeds whatever version it names, so a
    retry of a save that already landed is not reported as a conflict.
    """
    db_product = await require_locked_model(db, Product, product_id)
    await validate_product_type(db, product.product_type_id)
    apply_product_update(db_product, product)
    if not db.is_modified(db_product):
        # The fields were still set, so the next autoflush expires the first-image column;
        # reload it here, as the changing path does, rather than lazily while serializing.
        await db.refresh(db_product)
        return db_product
    if db_product.version != if_match_version:
        raise ProductVersionMismatchError

    db_product.version += 1

    res = await commit_and_refresh(db, db_product)
    if user_id != db_product.owner_id:
        # A moderator's correction of someone else's product.
        audit_event(user_id, AuditAction.UPDATE, Product, product_id)
    if db_product.owner_id is not None:
        await recompute_user_profile_stats(db, db_product.owner_id)
        await db.commit()
    return res


async def delete_product(db: AsyncSession, product_id: int) -> None:
    """Delete a product and its components, commit, then remove their media from storage."""
    owner_id = (await require_locked_model(db, Product, product_id)).owner_id
    # Bulk statements over the subtree: the ORM delete cascade would load every
    # component's media, videos and components one row at a time.
    subtree = product_subtree_ids(Product.id == product_id)
    storage_cleanups = await delete_product_media(db, subtree)
    await delete_product_rows(db, subtree)

    if owner_id is not None:
        await db.flush()
        await recompute_user_upload_quota(db, user_id=owner_id)
        await recompute_user_profile_stats(db, owner_id)
    await db.commit()
    audit_event(owner_id, AuditAction.DELETE, Product, product_id)
    await cleanup_product_media_storage(storage_cleanups)
