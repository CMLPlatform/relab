"""CRUD helpers for categorized reference-data resources with media."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, cast

from sqlalchemy import select

from app.api.common.crud.associations import add_links
from app.api.common.crud.persistence import SupportsModelDump, commit_and_refresh
from app.api.common.crud.query import require_locked_model, require_model
from app.api.common.crud.utils import validate_linked_items_exist, validate_no_duplicate_linked_items
from app.api.common.exceptions import ConflictError
from app.api.common.models.base import get_model_label
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.file_storage.crud.parent_media import ParentMediaCrud, unlink_stored_media
from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.reference_data.crud.categories import validate_category_taxonomy_domains
from app.api.reference_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    TaxonomyDomain,
)

from .persistence import create_reference_model

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm.attributes import InstrumentedAttribute

    from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm


type CategorizedReference = Material | ProductType
type CategoryLink = CategoryMaterialLink | CategoryProductTypeLink


@dataclass(frozen=True)
class CategorizedReferenceSpec[ResourceT: CategorizedReference, LinkT: CategoryLink]:
    """Configuration for reference data that can be categorized and have media."""

    model: type[ResourceT]
    expected_domains: set[TaxonomyDomain]
    category_link_model: type[LinkT]
    category_link_parent_id: InstrumentedAttribute[int]
    files: ParentMediaCrud[File, FileCreate]
    images: ParentMediaCrud[Image, ImageCreateFromForm]
    # Referencing column that blocks deletion (its FK has no cascade), plus the
    # human name of that relation for the conflict message.
    in_use_column: InstrumentedAttribute[int] | InstrumentedAttribute[int | None]
    in_use_label: str


MATERIAL_RESOURCE = CategorizedReferenceSpec(
    model=Material,
    expected_domains={TaxonomyDomain.MATERIALS},
    category_link_model=CategoryMaterialLink,
    category_link_parent_id=CategoryMaterialLink.material_id,
    files=ParentMediaCrud(
        parent_model=Material,
        parent_type=MediaParentType.MATERIAL,
        storage_model=File,
        storage_service=file_storage_service,
    ),
    images=ParentMediaCrud(
        parent_model=Material,
        parent_type=MediaParentType.MATERIAL,
        storage_model=Image,
        storage_service=image_storage_service,
    ),
    in_use_column=MaterialProductLink.material_id,
    in_use_label="bill of materials entries",
)

PRODUCT_TYPE_RESOURCE = CategorizedReferenceSpec(
    model=ProductType,
    expected_domains={TaxonomyDomain.PRODUCTS},
    category_link_model=CategoryProductTypeLink,
    category_link_parent_id=CategoryProductTypeLink.product_type_id,
    files=ParentMediaCrud(
        parent_model=ProductType,
        parent_type=MediaParentType.PRODUCT_TYPE,
        storage_model=File,
        storage_service=file_storage_service,
    ),
    images=ParentMediaCrud(
        parent_model=ProductType,
        parent_type=MediaParentType.PRODUCT_TYPE,
        storage_model=Image,
        storage_service=image_storage_service,
    ),
    in_use_column=Product.product_type_id,
    in_use_label="products",
)


async def create_categorized_reference[ResourceT: CategorizedReference, LinkT: CategoryLink](
    db: AsyncSession,
    spec: CategorizedReferenceSpec[ResourceT, LinkT],
    payload: SupportsModelDump,
) -> ResourceT:
    """Create a categorized reference-data resource and optional category links."""
    db_parent = await create_reference_model(db, spec.model, payload, exclude_fields={"category_ids"})
    category_ids = cast("set[int]", getattr(payload, "category_ids", set()))

    if category_ids:
        await validate_category_taxonomy_domains(db, category_ids, spec.expected_domains)
        await add_links(
            db,
            id1=db_parent.id,
            id1_attr=spec.category_link_parent_id,
            id2_set=category_ids,
            id2_attr=spec.category_link_model.category_id,
            link_model=spec.category_link_model,
        )

    return await commit_and_refresh(db, db_parent, add_before_commit=False)


async def _require_not_in_use[ResourceT: CategorizedReference, LinkT: CategoryLink](
    db: AsyncSession,
    spec: CategorizedReferenceSpec[ResourceT, LinkT],
    parent_id: int,
) -> None:
    """Reject deletion while research data still references the resource.

    The referencing FKs are NO ACTION, so without this the delete surfaces as a raw
    IntegrityError (500) instead of telling the admin what is holding the row.
    """
    referenced = await db.execute(select(spec.in_use_column).where(spec.in_use_column == parent_id).limit(1))
    if referenced.first() is None:
        return

    label = get_model_label(spec.model).lower()
    msg = f"This {label} is still referenced by {spec.in_use_label} and cannot be deleted."
    raise ConflictError(msg)


async def delete_categorized_reference[ResourceT: CategorizedReference, LinkT: CategoryLink](
    db: AsyncSession,
    spec: CategorizedReferenceSpec[ResourceT, LinkT],
    parent_id: int,
) -> None:
    """Delete a categorized reference-data resource and its attached media atomically.

    Media rows and the parent row drop in a single transaction under the row lock, so a
    concurrent delete is serialized and a mid-delete failure can't leave the parent behind
    with its media already gone (media reference their parent generically, with no FK
    cascade). The stored bytes are unlinked only after that commit is durable — a commit
    that fails leaves the files intact rather than orphaning live rows that point at them.

    Raises:
        ConflictError: when research data still references the resource.
    """
    db_parent = await require_locked_model(db, spec.model, parent_id)
    await _require_not_in_use(db, spec, parent_id)
    pending_files = await spec.files.delete_all(db, parent_id)
    pending_images = await spec.images.delete_all(db, parent_id)
    await db.delete(db_parent)
    await db.commit()
    await unlink_stored_media(pending_files)
    await unlink_stored_media(pending_images)


async def add_categorized_reference_categories[ResourceT: CategorizedReference, LinkT: CategoryLink](
    db: AsyncSession,
    spec: CategorizedReferenceSpec[ResourceT, LinkT],
    parent_id: int,
    category_ids: set[int],
) -> Sequence[Category]:
    """Create validated category links for a categorized reference-data resource."""
    db_parent = await require_model(db, spec.model, model_id=parent_id, loaders={"categories"})
    db_categories = await validate_category_taxonomy_domains(db, category_ids, spec.expected_domains)

    if db_parent.categories:
        validate_no_duplicate_linked_items(category_ids, db_parent.categories, "Categories")

    await add_links(
        db,
        id1=parent_id,
        id1_attr=spec.category_link_parent_id,
        id2_set=category_ids,
        id2_attr=spec.category_link_model.category_id,
        link_model=spec.category_link_model,
    )
    await db.commit()
    return db_categories


async def remove_categorized_reference_categories[ResourceT: CategorizedReference, LinkT: CategoryLink](
    db: AsyncSession,
    spec: CategorizedReferenceSpec[ResourceT, LinkT],
    parent_id: int,
    category_ids: set[int],
) -> None:
    """Remove validated category links from a categorized reference-data resource."""
    db_parent = await require_model(db, spec.model, model_id=parent_id, loaders={"categories"})
    validate_linked_items_exist(category_ids, db_parent.categories, "Categories")

    statement = (
        select(spec.category_link_model)
        .where(spec.category_link_parent_id == parent_id)
        .where(spec.category_link_model.category_id.in_(category_ids))
    )
    results = await db.execute(statement)
    for category_link in results.scalars().all():
        await db.delete(category_link)
    await db.commit()
