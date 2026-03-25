"""CRUD operations for the background data models."""

from typing import TYPE_CHECKING, Any, cast

from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import col, select

from app.api.background_data.filters import (
    CategoryFilter,
    CategoryFilterWithRelationships,
)
from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)
from app.api.background_data.schemas import (
    CategoryCreateWithinCategoryWithSubCategories,
    CategoryCreateWithinTaxonomyWithSubCategories,
    CategoryCreateWithSubCategories,
    CategoryUpdate,
    MaterialCreate,
    MaterialCreateWithCategories,
    MaterialUpdate,
    ProductTypeCreate,
    ProductTypeCreateWithCategories,
    ProductTypeUpdate,
    TaxonomyCreate,
    TaxonomyCreateWithCategories,
    TaxonomyUpdate,
)
from app.api.common.crud.associations import create_model_links
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.persistence import (
    SupportsModelDump,
    commit_and_refresh,
    delete_and_commit,
    update_and_commit,
)
from app.api.common.crud.utils import (
    enum_format_id_set,
    format_id_set,
    get_model_or_404,
    get_models_by_ids_or_404,
    validate_linked_items_exist,
    validate_no_duplicate_linked_items,
)
from app.api.common.exceptions import BadRequestError, InternalServerError
from app.api.file_storage.crud import ParentStorageOperations, file_storage_service, image_storage_service
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlmodel.sql._expression_select_cls import SelectOfScalar

# NOTE: GET operations are implemented in the crud.common.base module

# TODO: Extract common CRUD operations to class-based factories in a separate
# module. This includes basic CRUD,
# filter generation, relationship handling, category links, and file management for all models.
# See the parent-file operations in the file_storage module for an example of how to refactor these operations


def _normalize_category_ids(category_ids: int | set[int]) -> set[int]:
    """Normalize single category IDs into a set-based API."""
    return {category_ids} if isinstance(category_ids, int) else category_ids


async def _create_background_model[ModelT: Taxonomy | Material | ProductType](
    db: AsyncSession,
    model: type[ModelT],
    payload: SupportsModelDump,
    *,
    exclude_fields: set[str],
) -> ModelT:
    """Create and flush a background-data model from a request payload."""
    model_data = cast("dict[str, Any]", payload.model_dump(exclude=exclude_fields))
    db_model = model(**model_data)
    db.add(db_model)
    await db.flush()
    return db_model


async def _update_background_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
    payload: SupportsModelDump,
) -> ModelT:
    """Apply a partial update and persist the model."""
    db_model: ModelT = await get_model_or_404(db, model, model_id)
    return await update_and_commit(db, db_model, payload)


async def _delete_background_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
) -> ModelT:
    """Delete a model after resolving it from the database."""
    db_model: ModelT = await get_model_or_404(db, model, model_id)
    await delete_and_commit(db, db_model)
    return db_model


async def _add_categories_to_parent_model[ParentT: Material | ProductType](
    db: AsyncSession,
    *,
    parent_model: type[ParentT],
    parent_id: int,
    category_ids: int | set[int],
    expected_domains: set[TaxonomyDomain],
    link_model: type[CategoryMaterialLink | CategoryProductTypeLink],
    link_parent_id_field: str,
) -> tuple[ParentT, Sequence[Category]]:
    """Create validated category links for a material-like parent model."""
    normalized_category_ids = _normalize_category_ids(category_ids)

    db_parent = await get_model_by_id(
        db,
        parent_model,
        model_id=parent_id,
        include_relationships={"categories"},
    )

    db_categories: Sequence[Category] = await get_models_by_ids_or_404(db, Category, normalized_category_ids)
    await validate_category_taxonomy_domains(db, normalized_category_ids, expected_domains)

    if db_parent.categories:
        validate_no_duplicate_linked_items(normalized_category_ids, db_parent.categories, "Categories")

    await create_model_links(
        db,
        id1=db_parent.id,
        id1_field=link_parent_id_field,
        id2_set=normalized_category_ids,
        id2_field="category_id",
        link_model=link_model,
    )

    return db_parent, db_categories


async def _remove_categories_from_parent_model[ParentT: Material | ProductType](
    db: AsyncSession,
    *,
    parent_model: type[ParentT],
    parent_id: int,
    category_ids: int | set[int],
    link_model: type[CategoryMaterialLink | CategoryProductTypeLink],
    link_parent_id_field: str,
) -> None:
    """Remove validated category links from a material-like parent model."""
    normalized_category_ids = _normalize_category_ids(category_ids)

    db_parent = await get_model_by_id(
        db,
        parent_model,
        model_id=parent_id,
        include_relationships={"categories"},
    )

    validate_linked_items_exist(normalized_category_ids, db_parent.categories, "Categories")

    statement = (
        select(link_model)
        .where(col(getattr(link_model, link_parent_id_field)) == parent_id)
        .where(col(link_model.category_id).in_(normalized_category_ids))
    )
    results = await db.exec(statement)
    for category_link in results.all():
        await db.delete(category_link)


### Category CRUD operations ###
## Utilities ##
async def validate_category_creation(
    db: AsyncSession,
    category: CategoryCreateWithSubCategories
    | CategoryCreateWithinCategoryWithSubCategories
    | CategoryCreateWithinTaxonomyWithSubCategories,
    taxonomy_id: int | None = None,
    supercategory_id: int | None = None,
) -> tuple[int, Category | None]:
    """Validate category creation parameters and return taxonomy_id and supercategory."""
    if supercategory_id:
        supercategory: Category = await get_model_or_404(db, Category, supercategory_id)

        taxonomy_id = taxonomy_id or supercategory.taxonomy_id
        if supercategory.taxonomy_id != taxonomy_id:
            err_msg: str = f"Supercategory with id {supercategory_id} does not belong to taxonomy with id {taxonomy_id}"
            raise BadRequestError(err_msg)
        return taxonomy_id, supercategory

    taxonomy_id = taxonomy_id or getattr(category, "taxonomy_id", None)

    if not taxonomy_id:
        err_msg = "Taxonomy ID is required for top-level categories"
        raise BadRequestError(err_msg)

    # Check if taxonomy exists
    await get_model_or_404(db, Taxonomy, taxonomy_id)

    return taxonomy_id, None


async def validate_category_taxonomy_domains(
    db: AsyncSession, category_ids: set[int], expected_domains: TaxonomyDomain | set[TaxonomyDomain]
) -> None:
    """Validate that categories belong to taxonomies with expected domains.

    Args:
        db: Database session
        category_ids: Collection of category IDs to validate
        expected_domains: Set of allowed taxonomy domains

    Raises:
        ValueError: If categories don't exist or belong to wrong domains
    """
    categories_statement: SelectOfScalar[Category] = (
        select(Category)
        .join(Taxonomy)
        .where(col(Category.id).in_(category_ids))
        .options(selectinload(cast("QueryableAttribute[Any]", Category.taxonomy)))
    )
    categories: Sequence[Category] = list((await db.exec(categories_statement)).all())

    if len(categories) != len(category_ids):
        missing = set(category_ids) - {c.id for c in categories}
        err_msg: str = f"Categories with id {format_id_set(missing)} not found"
        raise BadRequestError(err_msg)

    # Cast single domain to set if needed
    if isinstance(expected_domains, TaxonomyDomain):
        expected_domains = {expected_domains}

    invalid = {
        c.id
        for c in categories
        if not (set(c.taxonomy.domains) & expected_domains)  # Check for domain overlap
    }
    if invalid:
        err_msg: str = (
            f"Categories with id {format_id_set(invalid)} belong to taxonomies "
            f"outside of domains: {enum_format_id_set(expected_domains)}"
        )
        raise BadRequestError(err_msg)


## Basic CRUD operations ##
async def get_category_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    supercategory_id: int | None = None,
    taxonomy_id: int | None = None,
    category_filter: CategoryFilter | CategoryFilterWithRelationships | None = None,
) -> list[Category]:
    """Get categories with their subcategories up to specified depth.

    If supercategory_id is None, get top-level categories.
    """
    # Provide either supercategory_id or taxonomy_id
    if supercategory_id and taxonomy_id:
        err_msg = "Provide either supercategory_id or taxonomy_id, not both"
        raise BadRequestError(err_msg)

    # Validate that supercategory or taxonomy exists
    if supercategory_id:
        await get_model_or_404(db, Category, supercategory_id)

    if taxonomy_id:
        await get_model_or_404(db, Taxonomy, taxonomy_id)

    statement: SelectOfScalar[Category] = (
        select(Category)
        .where(Category.supercategory_id == supercategory_id)
        # Refresh already-present ORM instances so recursive reads don't reuse stale relationship collections.
        .execution_options(populate_existing=True)
    )

    if taxonomy_id:
        await get_model_or_404(db, Taxonomy, taxonomy_id)
        statement = statement.where(Category.taxonomy_id == taxonomy_id)

    if category_filter:
        statement = category_filter.filter(statement)

    # Load subcategories recursively
    statement = statement.options(
        selectinload(cast("QueryableAttribute[Any]", Category.subcategories), recursion_depth=recursion_depth)
    )

    return list((await db.exec(statement)).all())


async def create_category(
    db: AsyncSession,
    category: CategoryCreateWithSubCategories
    | CategoryCreateWithinCategoryWithSubCategories
    | CategoryCreateWithinTaxonomyWithSubCategories,
    taxonomy_id: int | None = None,
    supercategory_id: int | None = None,
    *,
    _is_recursive_call: bool = False,  # Flag to track recursive calls
) -> Category:
    """Create a new category in the database and handle subcategory categories recursively."""
    # Validate and get taxonomy_id and supercategory
    taxonomy_id, supercategory = await validate_category_creation(
        db,
        category,
        taxonomy_id,
        supercategory_id
        if isinstance(category, CategoryCreateWithinCategoryWithSubCategories)
        else category.supercategory_id,
    )

    # Create category
    db_category = Category(
        name=category.name,
        description=category.description,
        taxonomy_id=taxonomy_id,
        supercategory_id=supercategory.id if supercategory else None,
    )
    db.add(db_category)
    await db.flush()  # Assign an ID to the category

    # Create subcategories recursively
    if category.subcategories:
        for subcategory in category.subcategories:
            await create_category(
                db,
                subcategory,
                taxonomy_id=taxonomy_id,
                supercategory_id=db_category.id,
                _is_recursive_call=True,  # Mark recursive calls
            )

    # Commit only when it's not a recursive call
    if not _is_recursive_call:
        await db.commit()
        await db.refresh(db_category)

    return db_category


async def update_category(db: AsyncSession, category_id: int, category: CategoryUpdate) -> Category:
    """Update an existing category in the database."""
    return await _update_background_model(db, Category, category_id, category)


async def delete_category(db: AsyncSession, category_id: int) -> None:
    """Delete a category from the database."""
    await _delete_background_model(db, Category, category_id)


### Taxonomy CRUD operations ###
## Basic CRUD operations ##
async def create_taxonomy(db: AsyncSession, taxonomy: TaxonomyCreate | TaxonomyCreateWithCategories) -> Taxonomy:
    """Create a new taxonomy in the database."""
    db_taxonomy = await _create_background_model(db, Taxonomy, taxonomy, exclude_fields={"categories"})

    # Handle categories if provided
    if isinstance(taxonomy, TaxonomyCreateWithCategories) and taxonomy.categories:
        for category_data in taxonomy.categories:
            await create_category(db, category_data, taxonomy_id=db_taxonomy.id)

    return await commit_and_refresh(db, db_taxonomy, add_before_commit=False)


async def update_taxonomy(db: AsyncSession, taxonomy_id: int, taxonomy: TaxonomyUpdate) -> Taxonomy:
    """Update an existing taxonomy in the database."""
    return await _update_background_model(db, Taxonomy, taxonomy_id, taxonomy)


async def delete_taxonomy(db: AsyncSession, taxonomy_id: int) -> None:
    """Delete a taxonomy from the database, including its categories."""
    await _delete_background_model(db, Taxonomy, taxonomy_id)


### Material CRUD operations ###
## Basic CRUD operations ##
async def create_material(db: AsyncSession, material: MaterialCreate | MaterialCreateWithCategories) -> Material:
    """Create a new material in the database, optionally with category links."""
    db_material = await _create_background_model(db, Material, material, exclude_fields={"category_ids"})

    # Add category links if provided
    if isinstance(material, MaterialCreateWithCategories) and material.category_ids:
        # Validate categories exist
        await get_models_by_ids_or_404(db, Category, material.category_ids)

        # Validate category domains
        await validate_category_taxonomy_domains(db, material.category_ids, {TaxonomyDomain.MATERIALS})

        # Create links
        await create_model_links(
            db,
            id1=db_material.db_id,
            id1_field="material_id",
            id2_set=material.category_ids,
            id2_field="category_id",
            link_model=CategoryMaterialLink,
        )

    return await commit_and_refresh(db, db_material, add_before_commit=False)


async def update_material(db: AsyncSession, material_id: int, material: MaterialUpdate) -> Material:
    """Update an existing material in the database."""
    return await _update_background_model(db, Material, material_id, material)


async def delete_material(db: AsyncSession, material_id: int) -> None:
    """Delete a material from the database."""
    db_material = await get_model_or_404(db, Material, material_id)

    # Delete storage files
    await material_files_crud.delete_all(db, material_id)
    await material_images_crud.delete_all(db, material_id)

    await db.delete(db_material)
    await db.commit()


## Category links operations ##
async def add_categories_to_material(
    db: AsyncSession, material_id: int, category_ids: int | set[int]
) -> Sequence[Category]:
    """Add categories to a material."""
    db_material, db_categories = await _add_categories_to_parent_model(
        db,
        parent_model=Material,
        parent_id=material_id,
        category_ids=category_ids,
        expected_domains={TaxonomyDomain.MATERIALS},
        link_model=CategoryMaterialLink,
        link_parent_id_field="material_id",
    )

    await db.commit()
    await db.refresh(db_material)
    return db_categories


async def add_category_to_material(db: AsyncSession, material_id: int, category_id: int) -> Category:
    """Add a category to a material."""
    db_category_list: Sequence[Category] = await add_categories_to_material(db, material_id, {category_id})

    if len(db_category_list) != 1:
        err_msg: str = (
            f"Database integrity error: Expected 1 category with id {category_id}, got {len(db_category_list)}"
        )
        raise InternalServerError(log_message=err_msg)

    return db_category_list[0]


async def remove_categories_from_material(db: AsyncSession, material_id: int, category_ids: int | set[int]) -> None:
    """Remove categories from a material."""
    await _remove_categories_from_parent_model(
        db,
        parent_model=Material,
        parent_id=material_id,
        category_ids=category_ids,
        link_model=CategoryMaterialLink,
        link_parent_id_field="material_id",
    )
    await db.commit()


## File Management ##
material_files_crud = ParentStorageOperations[Material, File, FileCreate, FileFilter](
    parent_model=Material,
    storage_model=File,
    parent_type=MediaParentType.MATERIAL,
    parent_field="material_id",
    storage_service=file_storage_service,
)

material_images_crud = ParentStorageOperations[Material, Image, ImageCreateFromForm, ImageFilter](
    parent_model=Material,
    storage_model=Image,
    parent_type=MediaParentType.MATERIAL,
    parent_field="material_id",
    storage_service=image_storage_service,
)


### ProductType CRUD operations ###
## Basic CRUD operations ##
async def create_product_type(
    db: AsyncSession, product_type: ProductTypeCreate | ProductTypeCreateWithCategories
) -> ProductType:
    """Create a new product type in the database, optionally with category links."""
    db_product_type = await _create_background_model(db, ProductType, product_type, exclude_fields={"category_ids"})

    # Add category links if provided
    if isinstance(product_type, ProductTypeCreateWithCategories) and product_type.category_ids:
        await create_model_links(
            db,
            id1=db_product_type.db_id,
            id1_field="product_type",
            id2_set=product_type.category_ids,
            id2_field="category_id",
            link_model=CategoryProductTypeLink,
        )
    return await commit_and_refresh(db, db_product_type, add_before_commit=False)


async def update_product_type(db: AsyncSession, product_type_id: int, product_type: ProductTypeUpdate) -> ProductType:
    """Update an existing product type in the database."""
    return await _update_background_model(db, ProductType, product_type_id, product_type)


async def delete_product_type(db: AsyncSession, product_type_id: int) -> None:
    """Delete a product type from the database."""
    db_product_type: ProductType = await get_model_or_404(db, ProductType, product_type_id)

    # Delete storage files
    await product_type_files.delete_all(db, product_type_id)
    await product_type_images.delete_all(db, product_type_id)

    await db.delete(db_product_type)
    await db.commit()


## Category links operations ##
# Basic GET operations are implemented in the associations CRUD operations


async def add_categories_to_product_type(
    db: AsyncSession, product_type_id: int, category_ids: set[int]
) -> Sequence[Category]:
    """Add categories to a product type."""
    _, db_categories = await _add_categories_to_parent_model(
        db,
        parent_model=ProductType,
        parent_id=product_type_id,
        category_ids=category_ids,
        expected_domains={TaxonomyDomain.PRODUCTS},
        link_model=CategoryProductTypeLink,
        link_parent_id_field="product_type",
    )
    await db.commit()

    return db_categories


async def add_category_to_product_type(db: AsyncSession, product_type_id: int, category_id: int) -> Category:
    """Add a category to a product type."""
    db_category_list: Sequence[Category] = await add_categories_to_product_type(db, product_type_id, {category_id})

    if len(db_category_list) != 1:
        err_msg: str = (
            f"Database integrity error: Expected 1 category with id {category_id}, got {len(db_category_list)}"
        )
        raise InternalServerError(log_message=err_msg)

    return db_category_list[0]


async def remove_categories_from_product_type(
    db: AsyncSession, product_type_id: int, category_ids: int | set[int]
) -> None:
    """Remove categories from a product type."""
    await _remove_categories_from_parent_model(
        db,
        parent_model=ProductType,
        parent_id=product_type_id,
        category_ids=category_ids,
        link_model=CategoryProductTypeLink,
        link_parent_id_field="product_type_id",
    )
    await db.commit()


## File management ##
product_type_files = ParentStorageOperations[ProductType, File, FileCreate, FileFilter](
    parent_model=ProductType,
    storage_model=File,
    parent_type=MediaParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
    storage_service=file_storage_service,
)

product_type_images = ParentStorageOperations[ProductType, Image, ImageCreateFromForm, ImageFilter](
    parent_model=ProductType,
    storage_model=Image,
    parent_type=MediaParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
    storage_service=image_storage_service,
)
