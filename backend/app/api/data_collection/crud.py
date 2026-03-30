"""CRUD operations for the models related to data collection."""

from typing import TYPE_CHECKING, Any, cast

from pydantic import UUID4
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import QueryableAttribute
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.background_data.models import (
    Material,
    ProductType,
)
from app.api.common.crud.associations import get_linking_model_with_ids_if_it_exists
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.persistence import (
    SupportsModelDump,
    commit_and_refresh,
    delete_and_commit,
    update_and_commit,
)
from app.api.common.crud.utils import (
    get_models_by_ids_or_404,
    validate_linked_items_exist,
    validate_no_duplicate_linked_items,
)
from app.api.common.exceptions import InternalServerError
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.exceptions import (
    MaterialIDRequiredError,
    ProductOwnerRequiredError,
    ProductPropertyAlreadyExistsError,
    ProductPropertyNotFoundError,
    ProductTreeMissingContentError,
)
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models import CircularityProperties, MaterialProductLink, PhysicalProperties, Product
from app.api.data_collection.schemas import (
    CircularityPropertiesCreate,
    CircularityPropertiesUpdate,
    ComponentCreateWithComponents,
    PhysicalPropertiesCreate,
    PhysicalPropertiesUpdate,
    ProductCreateWithComponents,
    ProductUpdate,
    ProductUpdateWithProperties,
)
from app.api.file_storage.crud import (
    ParentStorageCrud,
    file_storage_service,
    image_storage_service,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image, MediaParentType, Video
from app.api.file_storage.schemas import (
    FileCreate,
    ImageCreateFromForm,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.sql._expression_select_cls import SelectOfScalar


async def _get_product_with_relationship(
    db: AsyncSession,
    product_id: int,
    relationship_name: str,
) -> Product:
    """Fetch a product with one explicit relationship loaded."""
    return await get_model_by_id(db, Product, product_id, include_relationships={relationship_name})


def _require_product_relationship[PropertyT: PhysicalProperties | CircularityProperties](
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


async def _create_product_property[
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
    product = await _get_product_with_relationship(db, product_id, relationship_name)
    if getattr(product, relationship_name):
        raise ProductPropertyAlreadyExistsError(product_id, already_exists_label)

    db_property = property_model(**payload.model_dump(), product_id=product_id)
    setattr(product, relationship_name, db_property)
    return await commit_and_refresh(db, db_property)


async def _update_product_property[
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
    product = await _get_product_with_relationship(db, product_id, relationship_name)
    db_property = _require_product_relationship(
        product,
        relationship_name=relationship_name,
        not_found_label=not_found_label,
    )
    return await update_and_commit(db, db_property, payload)


async def _delete_product_property(
    db: AsyncSession,
    *,
    product: Product,
    relationship_name: str,
    not_found_label: str,
) -> None:
    """Delete a one-to-one product property row."""
    db_property = _require_product_relationship(
        product,
        relationship_name=relationship_name,
        not_found_label=not_found_label,
    )
    await delete_and_commit(db, db_property)


def _normalize_material_ids(material_ids: int | set[int]) -> set[int]:
    """Normalize a single material ID into the set-based CRUD interface."""
    return {material_ids} if isinstance(material_ids, int) else material_ids


async def _get_product_with_bill_of_materials(db: AsyncSession, product_id: int) -> Product:
    """Fetch a product with its bill of materials loaded."""
    return await get_model_by_id(db, Product, product_id, include_relationships={"bill_of_materials"})


async def _validate_product_material_links(
    db: AsyncSession,
    product_id: int,
    material_ids: int | set[int],
) -> tuple[Product, set[int]]:
    """Validate that the product and referenced materials exist."""
    normalized_material_ids = _normalize_material_ids(material_ids)
    product = await _get_product_with_bill_of_materials(db, product_id)
    await get_models_by_ids_or_404(db, Material, normalized_material_ids)
    return product, normalized_material_ids


async def _get_material_links_for_product(
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


### PhysicalProperty CRUD operations ###
async def get_physical_properties(db: AsyncSession, product_id: int) -> PhysicalProperties:
    """Get physical properties for a product."""
    product = await _get_product_with_relationship(db, product_id, "physical_properties")
    return _require_product_relationship(
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
    return await _create_product_property(
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
    return await _update_product_property(
        db,
        product_id=product_id,
        payload=physical_properties,
        relationship_name="physical_properties",
        not_found_label="Physical properties",
    )


async def delete_physical_properties(db: AsyncSession, product: Product) -> None:
    """Delete physical properties for a product."""
    await _delete_product_property(
        db,
        product=product,
        relationship_name="physical_properties",
        not_found_label="Physical properties",
    )


### CircularityProperty CRUD operations ###
async def get_circularity_properties(db: AsyncSession, product_id: int) -> CircularityProperties:
    """Get circularity properties for a product."""
    product = await _get_product_with_relationship(db, product_id, "circularity_properties")
    return _require_product_relationship(
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
    return await _create_product_property(
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
    return await _update_product_property(
        db,
        product_id=product_id,
        payload=circularity_properties,
        relationship_name="circularity_properties",
        not_found_label="Circularity properties",
    )


async def delete_circularity_properties(db: AsyncSession, product: Product) -> None:
    """Delete circularity properties for a product."""
    await _delete_product_property(
        db,
        product=product,
        relationship_name="circularity_properties",
        not_found_label="Circularity properties",
    )


### Product CRUD operations ###
## Basic CRUD operations ###
async def get_product_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    parent_id: int | None = None,
    product_filter: ProductFilterWithRelationships | None = None,
) -> Sequence[Product]:
    """Get product with their components up to specified depth.

    If parent_id is None, get top-level products.
    """
    # Validate that parent product exists
    if parent_id:
        await get_model_by_id(db, Product, parent_id)

    statement: SelectOfScalar[Product] = (
        select(Product)
        .where(Product.parent_id == parent_id)
        .options(
            selectinload(cast("QueryableAttribute[Any]", Product.components), recursion_depth=recursion_depth),
            selectinload(cast("QueryableAttribute[Any]", Product.product_type)),
            selectinload(cast("QueryableAttribute[Any]", Product.videos)),
            selectinload(cast("QueryableAttribute[Any]", Product.files)),
            selectinload(cast("QueryableAttribute[Any]", Product.images)),
        )
    )

    if product_filter:
        statement = product_filter.filter(statement)

    return list((await db.exec(statement)).all())


def _product_payload(
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
) -> dict[str, Any]:
    """Return the shared payload used to create a product or component."""
    return product_data.model_dump(
        exclude={
            "components",
            "owner_id",
            "physical_properties",
            "circularity_properties",
            "videos",
            "bill_of_materials",
        }
    )


async def _create_product_record(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4,
    parent_product: Product | None = None,
) -> Product:
    """Create the base Product row and flush it so dependent rows can reference it."""
    db_product = Product(
        **_product_payload(product_data),
        owner_id=owner_id,
        parent=parent_product,
    )
    db.add(db_product)
    await db.flush()
    return db_product


def _create_product_properties(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create one-to-one product property rows when present."""
    if product_data.physical_properties:
        db_physical_property = PhysicalProperties(**product_data.physical_properties.model_dump())
        db_physical_property.product = db_product
        db.add(db_physical_property)

    if product_data.circularity_properties:
        db_circularity_property = CircularityProperties(**product_data.circularity_properties.model_dump())
        db_circularity_property.product = db_product
        db.add(db_circularity_property)


def _create_product_videos(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create video rows linked to the product."""
    if not product_data.videos:
        return

    if db_product.videos is None:
        db_product.videos = []

    for video in product_data.videos:
        db_video = Video(**video.model_dump())
        db_product.videos.append(db_video)
        db.add(db_video)


async def _create_product_bill_of_materials(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    db_product: Product,
) -> None:
    """Create bill-of-materials rows linked to the product."""
    if not product_data.bill_of_materials:
        return

    material_ids = {material.material_id for material in product_data.bill_of_materials}
    await get_models_by_ids_or_404(db, Material, material_ids)

    db.add_all(
        MaterialProductLink(**material.model_dump(), product=db_product) for material in product_data.bill_of_materials
    )


async def _create_product_components(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4,
    db_product: Product,
) -> None:
    """Recursively create child components for a product."""
    for component in product_data.components:
        await _create_product_tree(db, component, owner_id=owner_id, parent_product=db_product)


async def _create_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None = None,
    parent_product: Product | None = None,
) -> Product:
    if not product_data.bill_of_materials and not product_data.components:
        raise ProductTreeMissingContentError

    if owner_id is None:
        raise ProductOwnerRequiredError

    db_product = await _create_product_record(db, product_data, owner_id=owner_id, parent_product=parent_product)
    _create_product_properties(db, product_data, db_product)
    _create_product_videos(db, product_data, db_product)
    await _create_product_bill_of_materials(db, product_data, db_product)
    await _create_product_components(db, product_data, owner_id=owner_id, db_product=db_product)

    return db_product


async def _create_and_persist_product_tree(
    db: AsyncSession,
    product_data: ProductCreateWithComponents | ComponentCreateWithComponents,
    *,
    owner_id: UUID4 | None,
    parent_product: Product | None = None,
) -> Product:
    """Create a product tree and persist the root row."""
    if parent_product is None:
        db_product = await _create_product_tree(db, product_data, owner_id=owner_id)
    else:
        db_product = await _create_product_tree(db, product_data, owner_id=owner_id, parent_product=parent_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def create_component(
    db: AsyncSession,
    component: ComponentCreateWithComponents,
    parent_product: Product,
) -> Product:
    """Add a component to a product."""
    return await _create_and_persist_product_tree(
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
    return await _create_and_persist_product_tree(db, product, owner_id=owner_id)


async def update_product(
    db: AsyncSession, product_id: int, product: ProductUpdate | ProductUpdateWithProperties
) -> Product:
    """Update an existing product in the database."""
    # TODO: Consider whether to have the CRUD layer take in  model objects (like db_product)
    # pre-fetched and pre-validated by dependencies at the router level, instead of fetching the
    # product by id on the CRUD layer, to reduce the load on the DB, for all RUD operations in the app

    # Validate that product exists
    db_product = await get_model_by_id(db, Product, product_id)

    # Validate that product type exists
    if product.product_type_id:
        await get_model_by_id(db, ProductType, product.product_type_id)

    product_data: dict[str, Any] = product.model_dump(
        exclude_unset=True, exclude={"physical_properties", "circularity_properties"}
    )
    db_product.sqlmodel_update(product_data)

    # Update properties
    if isinstance(product, ProductUpdateWithProperties):
        if product.physical_properties:
            await update_physical_properties(db, product_id, product.physical_properties)
        if product.circularity_properties:
            await update_circularity_properties(db, product_id, product.circularity_properties)

    return await commit_and_refresh(db, db_product)


async def delete_product(db: AsyncSession, product_id: int) -> None:
    """Delete a product from the database."""
    # Validate that product exists
    db_product = await get_model_by_id(db, Product, product_id)

    # Delete stored files
    await product_files_crud.delete_all(db, product_id)
    await product_images_crud.delete_all(db, product_id)

    await db.delete(db_product)
    await db.commit()


## Product Storage operations ##
product_files_crud = ParentStorageCrud[File, FileCreate, FileFilter](
    parent_model=Product,
    storage_model=File,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
    storage_service=file_storage_service,
)

product_images_crud = ParentStorageCrud[Image, ImageCreateFromForm, ImageFilter](
    parent_model=Product,
    storage_model=Image,
    parent_type=MediaParentType.PRODUCT,
    parent_field="product_id",
    storage_service=image_storage_service,
)


## Bill of Materials operations ##
async def add_materials_to_product(
    db: AsyncSession, product_id: int, material_links: list[MaterialProductLinkCreateWithinProduct]
) -> list[MaterialProductLink]:
    """Add materials to a product."""
    material_ids: set[int] = {material_link.material_id for material_link in material_links}
    db_product, normalized_material_ids = await _validate_product_material_links(db, product_id, material_ids)

    # Validate no duplicate materials
    if db_product.bill_of_materials:
        validate_no_duplicate_linked_items(
            normalized_material_ids, db_product.bill_of_materials, "Materials", id_attr="material_id"
        )

    # Create material-product links
    db_material_product_links: list[MaterialProductLink] = [
        MaterialProductLink(**material_link.model_dump(), product_id=product_id) for material_link in material_links
    ]
    db.add_all(db_material_product_links)
    await db.commit()
    await db.refresh(db_material_product_links)

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

        # Cast to MaterialProductLinkCreateWithinProduct
        material_link = MaterialProductLinkCreateWithinProduct(material_id=material_id, **material_link.model_dump())

    # Add material link to product
    db_material_link_list: list[MaterialProductLink] = await add_materials_to_product(db, product_id, [material_link])

    if len(db_material_link_list) != 1:
        err_msg: str = (
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

    # Validate that material exists in the product
    db_material_link: MaterialProductLink = await get_linking_model_with_ids_if_it_exists(
        db,
        MaterialProductLink,
        product_id,
        material_id,
        "product_id",
        "material_id",
    )

    # Update material link
    return await update_and_commit(db, db_material_link, material_link)


async def remove_materials_from_product(db: AsyncSession, product_id: int, material_ids: int | set[int]) -> None:
    """Remove materials from a product."""
    product, normalized_material_ids = await _validate_product_material_links(db, product_id, material_ids)

    # Validate materials are actually assigned to the product
    validate_linked_items_exist(normalized_material_ids, product.bill_of_materials, "Materials", id_attr="material_id")

    # Fetch material-product links to delete
    # Delete each material-product link
    for material_link in await _get_material_links_for_product(db, product_id, normalized_material_ids):
        await db.delete(material_link)

    await db.commit()
