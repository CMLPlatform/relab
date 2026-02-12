"""CRUD operations for the background data models."""

from collections.abc import Sequence

from sqlalchemy import Delete, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.background_data.filters import (
    CategoryFilter,
    CategoryFilterWithRelationships,
    TaxonomyFilter,
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
from app.api.common.crud.utils import (
    db_get_model_with_id_if_it_exists,
    db_get_models_with_ids_if_they_exist,
    enum_set_to_str,
    set_to_str,
    validate_linked_items_exist,
    validate_model_with_id_exists,
    validate_no_duplicate_linked_items,
)
from app.api.file_storage.crud import (
    ParentStorageOperations,
    create_file,
    create_image,
    delete_file,
    delete_image,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, FileParentType, Image, ImageParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm

# NOTE: GET operations are implemented in the crud.common.base module

# TODO: Extract common CRUD operations to class-based factories in a separate module. This includes basic CRUD,
# filter generation, relationship handling, category links, and file management for all models.
# See the parent-file operations in the file_storage module for an example of how to refactor these operations


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
        supercategory: Category = await db_get_model_with_id_if_it_exists(db, Category, supercategory_id)

        taxonomy_id = taxonomy_id or supercategory.taxonomy_id
        if supercategory.taxonomy_id != taxonomy_id:
            err_msg: str = f"Supercategory with id {supercategory_id} does not belong to taxonomy with id {taxonomy_id}"
            raise ValueError(err_msg)
        return taxonomy_id, supercategory

    taxonomy_id = taxonomy_id or getattr(category, "taxonomy_id", None)

    if not taxonomy_id:
        err_msg = "Taxonomy ID is required for top-level categories"
        raise ValueError(err_msg)

    # Check if taxonomy exists
    await db_get_model_with_id_if_it_exists(db, Taxonomy, taxonomy_id)

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
        .options(selectinload(Category.taxonomy))
    )
    categories: Sequence[Category] = (await db.exec(categories_statement)).all()

    if len(categories) != len(category_ids):
        missing = set(category_ids) - {c.id for c in categories}
        err_msg: str = f"Categories with id {set_to_str(missing)} not found"
        raise ValueError(err_msg)

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
            f"Categories with id {set_to_str(invalid)} belong to taxonomies "
            f"outside of domains: {enum_set_to_str(expected_domains)}"
        )
        raise ValueError(err_msg)


## Basic CRUD operations ##
async def get_category_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    supercategory_id: int | None = None,
    taxonomy_id: int | None = None,
    category_filter: CategoryFilter | CategoryFilterWithRelationships | None = None,
) -> Sequence[Category]:
    """Get categories with their subcategories up to specified depth.

    If supercategory_id is None, get top-level categories.
    """
    # Provide either supercategory_id or taxonomy_id
    if supercategory_id and taxonomy_id:
        err_msg = "Provide either supercategory_id or taxonomy_id, not both"
        raise ValueError(err_msg)

    # Validate that supercategory or taxonomy exists
    if supercategory_id:
        await db_get_model_with_id_if_it_exists(db, Category, supercategory_id)

    if taxonomy_id:
        await db_get_model_with_id_if_it_exists(db, Taxonomy, taxonomy_id)

    statement: SelectOfScalar[Category] = select(Category).where(Category.supercategory_id == supercategory_id)

    if taxonomy_id:
        await db_get_model_with_id_if_it_exists(db, Taxonomy, taxonomy_id)
        statement = statement.where(Category.taxonomy_id == taxonomy_id)

    if category_filter:
        statement = category_filter.filter(statement)

    # Load subcategories recursively
    statement = statement.options(selectinload(Category.subcategories, recursion_depth=recursion_depth))

    return (await db.exec(statement)).all()


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
    db_category: Category = await db_get_model_with_id_if_it_exists(db, Category, category_id)

    category_data = category.model_dump(exclude_unset=True)
    db_category.sqlmodel_update(category_data)

    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category


async def delete_category(db: AsyncSession, category_id: int) -> None:
    """Delete a category from the database."""
    db_category: Category = await db_get_model_with_id_if_it_exists(db, Category, category_id)

    await db.delete(db_category)
    await db.commit()


### Taxonomy CRUD operations ###
## Basic CRUD operations ##
async def get_taxonomies(
    db: AsyncSession,
    *,
    include_base_categories: bool = False,
    taxonomy_filter: TaxonomyFilter | None = None,
    statement: SelectOfScalar[Taxonomy] | None = None,
) -> Sequence[Taxonomy]:
    """Get taxonomies with optional filtering and base categories."""
    if statement is None:
        statement = select(Taxonomy)

    if taxonomy_filter:
        statement = taxonomy_filter.filter(statement)

    # Only load base categories if requested
    if include_base_categories:
        statement = statement.options(
            selectinload(Taxonomy.categories.and_(Category.supercategory_id == None))  # noqa: E711 # SQLalchemy 'select' statement requires '== None' for 'IS NULL'
        )

    result: Sequence[Taxonomy] = (await db.exec(statement)).all()

    # Set empty categories list if not included
    if not include_base_categories:
        for taxonomy in result:
            set_committed_value(taxonomy, "categories", [])

    return result


async def get_taxonomy_by_id(db: AsyncSession, taxonomy_id: int, *, include_base_categories: bool = False) -> Taxonomy:
    """Get taxonomy by ID with specified relationships."""
    statement: SelectOfScalar[Taxonomy] = select(Taxonomy).where(Taxonomy.id == taxonomy_id)

    if include_base_categories:
        statement = statement.options(
            selectinload(Taxonomy.categories.and_(Category.supercategory_id == None))  # noqa: E711 # SQLalchemy 'select' statement requires '== None' for 'IS NULL'
        )

    taxonomy: Taxonomy = validate_model_with_id_exists((await db.exec(statement)).one_or_none(), Taxonomy, taxonomy_id)
    if not include_base_categories:
        set_committed_value(taxonomy, "categories", [])
    return taxonomy


async def create_taxonomy(db: AsyncSession, taxonomy: TaxonomyCreate | TaxonomyCreateWithCategories) -> Taxonomy:
    """Create a new taxonomy in the database."""
    taxonomy_data = taxonomy.model_dump(exclude={"categories"})
    db_taxonomy = Taxonomy(**taxonomy_data)

    db.add(db_taxonomy)
    await db.flush()  # Assigns an ID to taxonomy

    # Handle categories if provided
    if isinstance(taxonomy, TaxonomyCreateWithCategories) and taxonomy.categories:
        for category_data in taxonomy.categories:
            await create_category(db, category_data, taxonomy_id=db_taxonomy.id)

    await db.commit()
    await db.refresh(db_taxonomy)
    return db_taxonomy


async def update_taxonomy(db: AsyncSession, taxonomy_id: int, taxonomy: TaxonomyUpdate) -> Taxonomy:
    """Update an existing taxonomy in the database."""
    db_taxonomy: Taxonomy = await db_get_model_with_id_if_it_exists(db, Taxonomy, taxonomy_id)

    taxonomy_data = taxonomy.model_dump(exclude_unset=True)

    db_taxonomy.sqlmodel_update(taxonomy_data)

    db.add(db_taxonomy)
    await db.commit()
    await db.refresh(db_taxonomy)
    return db_taxonomy


async def delete_taxonomy(db: AsyncSession, taxonomy_id: int) -> None:
    """Delete a taxonomy from the database, including its categories."""
    db_taxonomy: Taxonomy = await db_get_model_with_id_if_it_exists(db, Taxonomy, taxonomy_id)

    await db.delete(db_taxonomy)
    await db.commit()


### Material CRUD operations ###
## Basic CRUD operations ##
async def create_material(db: AsyncSession, material: MaterialCreate | MaterialCreateWithCategories) -> Material:
    """Create a new material in the database, optionally with category links."""
    # Create material
    material_data = material.model_dump(exclude={"category_ids"})
    db_material = Material(**material_data)
    db.add(db_material)
    await db.flush()  # Get material ID

    # Add category links if provided
    if isinstance(material, MaterialCreateWithCategories) and material.category_ids:
        # Validate categories exist
        await db_get_models_with_ids_if_they_exist(db, Category, material.category_ids)

        # Validate category domains
        await validate_category_taxonomy_domains(db, material.category_ids, {TaxonomyDomain.MATERIALS})

        # Create links
        await create_model_links(
            db,
            id1=db_material.id,  # ty: ignore[invalid-argument-type] # material ID is guaranteed by database flush above
            id1_field="material_id",
            id2_set=material.category_ids,
            id2_field="category_id",
            link_model=CategoryMaterialLink,
        )

    await db.commit()
    await db.refresh(db_material)
    return db_material


async def update_material(db: AsyncSession, material_id: int, material: MaterialUpdate) -> Material:
    """Update an existing material in the database."""
    db_material: Material = await db_get_model_with_id_if_it_exists(db, Material, material_id)

    material_data = material.model_dump(exclude_unset=True)
    db_material.sqlmodel_update(material_data)

    db.add(db_material)
    await db.commit()
    await db.refresh(db_material)
    return db_material


async def delete_material(db: AsyncSession, material_id: int) -> None:
    """Delete a material from the database."""
    db_material: Material = await db_get_model_with_id_if_it_exists(db, Material, material_id)

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
    # Cast single ID to set
    category_ids = {category_ids} if isinstance(category_ids, int) else category_ids

    # Validate material exists
    db_material: Material = await get_model_by_id(
        db, Material, model_id=material_id, include_relationships={"categories"}
    )

    # Validate categories exist and belong to the correct domain
    db_categories: Sequence[Category] = await db_get_models_with_ids_if_they_exist(db, Category, category_ids)
    await validate_category_taxonomy_domains(db, category_ids, {TaxonomyDomain.MATERIALS})

    if db_material.categories:
        validate_no_duplicate_linked_items(category_ids, db_material.categories, "Categories")

        await create_model_links(
            db,
            id1=db_material.id,  # ty: ignore[invalid-argument-type] # material ID is guaranteed by database flush above
            id1_field="material_id",
            id2_set=category_ids,
            id2_field="category_id",
            link_model=CategoryMaterialLink,
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
        raise RuntimeError(err_msg)

    return db_category_list[0]


async def remove_categories_from_material(db: AsyncSession, material_id: int, category_ids: int | set[int]) -> None:
    """Remove categories from a material."""
    # Cast single ID to set
    category_ids = {category_ids} if isinstance(category_ids, int) else category_ids

    # Validate material exists
    db_material: Material = await get_model_by_id(
        db, Material, model_id=material_id, include_relationships={"categories"}
    )

    # Check that categories are actually assigned
    validate_linked_items_exist(category_ids, db_material.categories, "Categories")

    statement: Delete = (
        delete(CategoryMaterialLink)
        .where(col(CategoryMaterialLink.material_id) == material_id)
        .where(col(CategoryMaterialLink.category_id).in_(category_ids))
    )
    await db.execute(statement)
    await db.commit()


## File Management ##
material_files_crud = ParentStorageOperations[Material, File, FileCreate, FileFilter](
    parent_model=Material,
    storage_model=File,
    parent_type=FileParentType.MATERIAL,
    parent_field="material_id",
    create_func=create_file,
    delete_func=delete_file,
)

material_images_crud = ParentStorageOperations[Material, Image, ImageCreateFromForm, ImageFilter](
    parent_model=Material,
    storage_model=Image,
    parent_type=ImageParentType.MATERIAL,
    parent_field="material_id",
    create_func=create_image,
    delete_func=delete_image,
)


### ProductType CRUD operations ###
## Basic CRUD operations ##
async def create_product_type(
    db: AsyncSession, product_type: ProductTypeCreate | ProductTypeCreateWithCategories
) -> ProductType:
    """Create a new product type in the database, optionally with category links."""
    # Create product type
    product_type_data = product_type.model_dump(exclude={"category_ids"})
    db_product_type = ProductType(**product_type_data)
    db.add(db_product_type)
    await db.flush()  # Get product type ID

    # Add category links if provided
    if isinstance(product_type, ProductTypeCreateWithCategories) and product_type.category_ids:
        await create_model_links(
            db,
            id1=db_product_type.id,  # ty: ignore[invalid-argument-type] # material ID is guaranteed by database flush above
            id1_field="product_type",
            id2_set=product_type.category_ids,
            id2_field="category_id",
            link_model=CategoryProductTypeLink,
        )
    await db.commit()
    await db.refresh(db_product_type)
    return db_product_type


async def update_product_type(db: AsyncSession, product_type_id: int, product_type: ProductTypeUpdate) -> ProductType:
    """Update an existing product type in the database."""
    db_product_type: ProductType = await db_get_model_with_id_if_it_exists(db, ProductType, product_type_id)

    product_type_data = product_type.model_dump(exclude_unset=True)
    db_product_type.sqlmodel_update(product_type_data)

    db.add(db_product_type)
    await db.commit()
    await db.refresh(db_product_type)
    return db_product_type


async def delete_product_type(db: AsyncSession, product_type_id: int) -> None:
    """Delete a product type from the database."""
    db_product_type: ProductType = await db_get_model_with_id_if_it_exists(db, ProductType, product_type_id)

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
    # Validate product type exists
    db_product_type: ProductType = await get_model_by_id(
        db, ProductType, product_type_id, include_relationships={"categories"}
    )

    # Validate categories exist and belong to the correct domain
    db_categories: Sequence[Category] = await db_get_models_with_ids_if_they_exist(db, Category, category_ids)
    await validate_category_taxonomy_domains(db, category_ids, {TaxonomyDomain.PRODUCTS})

    if db_product_type.categories:
        validate_no_duplicate_linked_items(category_ids, db_product_type.categories, "Categories")

    await create_model_links(
        db,
        id1=db_product_type.id,  # ty: ignore[invalid-argument-type] # material ID is guaranteed by database flush above
        id1_field="product_type",
        id2_set=category_ids,
        id2_field="category_id",
        link_model=CategoryProductTypeLink,
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
        raise RuntimeError(err_msg)

    return db_category_list[0]


async def remove_categories_from_product_type(
    db: AsyncSession, product_type_id: int, category_ids: int | set[int]
) -> None:
    """Remove categories from a product type."""
    # Cast single ID to set
    category_ids = {category_ids} if isinstance(category_ids, int) else category_ids

    # Validate product type exists
    db_product_type: ProductType = await get_model_by_id(
        db, ProductType, product_type_id, include_relationships={"categories"}
    )

    # Check that categories are actually assigned
    validate_linked_items_exist(category_ids, db_product_type.categories, "Categories")

    statement: Delete = (
        delete(CategoryProductTypeLink)
        .where(col(CategoryProductTypeLink.product_type_id) == product_type_id)
        .where(col(CategoryProductTypeLink.category_id).in_(category_ids))
    )
    await db.execute(statement)
    await db.commit()


## File management ##
product_type_files = ParentStorageOperations[ProductType, File, FileCreate, FileFilter](
    parent_model=ProductType,
    storage_model=File,
    parent_type=FileParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
    create_func=create_file,
    delete_func=delete_file,
)

product_type_images = ParentStorageOperations[ProductType, Image, ImageCreateFromForm, ImageFilter](
    parent_model=ProductType,
    storage_model=Image,
    parent_type=ImageParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
    create_func=create_image,
    delete_func=delete_image,
)
