"""CRUD operations for the models related to data collection."""

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from pydantic import UUID4
from sqlalchemy import Delete, delete
from sqlalchemy.orm import selectinload
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from app.api.auth.models import User
from app.api.background_data.models import (
    Material,
    ProductType,
)
from app.api.common.crud.associations import get_linking_model_with_ids_if_it_exists
from app.api.common.crud.utils import (
    db_get_model_with_id_if_it_exists,
    db_get_models_with_ids_if_they_exist,
    validate_linked_items_exist,
    validate_no_duplicate_linked_items,
)
from app.api.common.models.associations import MaterialProductLink
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkCreateWithinProductAndMaterial,
    MaterialProductLinkUpdate,
)
from app.api.data_collection.filters import ProductFilterWithRelationships
from app.api.data_collection.models import CircularityProperties, PhysicalProperties, Product
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
from app.api.file_storage.crud import ParentStorageOperations, create_file, create_image, delete_file, delete_image
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, FileParentType, Image, ImageParentType, Video
from app.api.file_storage.schemas import (
    FileCreate,
    ImageCreateFromForm,
)

if TYPE_CHECKING:
    from pydantic import EmailStr
    from sqlmodel.sql._expression_select_cls import SelectOfScalar

# NOTE: GET operations are implemented in the crud.common.base module
# TODO: Implement ownership checks for products and files
# TODO: Consider wether or not this should be a simple ownership check
# or if users can do get operations on any objects owned by members of the same organization


### PhysicalProperty CRUD operations ###
async def get_physical_properties(db: AsyncSession, product_id: int) -> PhysicalProperties:
    """Get physical properties for a product."""
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    if not product.physical_properties:
        err_msg: str = f"Physical properties for product with id {product_id} not found"
        raise ValueError(err_msg)

    return product.physical_properties


async def create_physical_properties(
    db: AsyncSession,
    physical_properties: PhysicalPropertiesCreate,
    product_id: int,
) -> PhysicalProperties:
    """Create physical properties for a product."""
    # Validate that product exists and doesn't have physical properties
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)
    if product.physical_properties:
        err_msg: str = f"Product with id {product_id} already has physical properties"
        raise ValueError(err_msg)

    # Create physical properties
    db_physical_property = PhysicalProperties(
        **physical_properties.model_dump(),
        product_id=product_id,
    )
    db.add(db_physical_property)
    await db.commit()
    await db.refresh(db_physical_property)

    return db_physical_property


async def update_physical_properties(
    db: AsyncSession, product_id: int, physical_properties: PhysicalPropertiesUpdate
) -> PhysicalProperties:
    """Update physical properties for a product."""
    # Validate that product exists and has physical properties
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)
    if not (db_physical_properties := product.physical_properties):
        err_msg: EmailStr = f"Physical properties for product with id {product_id} not found"
        raise ValueError(err_msg)

    physical_properties_data: dict[str, Any] = physical_properties.model_dump(exclude_unset=True)
    db_physical_properties.sqlmodel_update(physical_properties_data)

    db.add(db_physical_properties)
    await db.commit()
    await db.refresh(db_physical_properties)
    return db_physical_properties


async def delete_physical_properties(db: AsyncSession, product: Product) -> None:
    """Delete physical properties for a product."""
    # Validate that product exists and has physical properties
    if not (db_physical_properties := product.physical_properties):
        err_msg: EmailStr = f"Physical properties for product with id {product.id} not found"
        raise ValueError(err_msg)

    await db.delete(db_physical_properties)
    await db.commit()


### CircularityProperty CRUD operations ###
async def get_circularity_properties(db: AsyncSession, product_id: int) -> CircularityProperties:
    """Get circularity properties for a product."""
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    if not product.circularity_properties:
        err_msg: str = f"Circularity properties for product with id {product_id} not found"
        raise ValueError(err_msg)

    return product.circularity_properties


async def create_circularity_properties(
    db: AsyncSession,
    circularity_properties: CircularityPropertiesCreate,
    product_id: int,
) -> CircularityProperties:
    """Create circularity properties for a product."""
    # Validate that product exists and doesn't have circularity properties
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)
    if product.circularity_properties:
        err_msg: str = f"Product with id {product_id} already has circularity properties"
        raise ValueError(err_msg)

    # Create circularity properties
    db_circularity_property = CircularityProperties(
        **circularity_properties.model_dump(),
        product_id=product_id,
    )
    db.add(db_circularity_property)
    await db.commit()
    await db.refresh(db_circularity_property)

    return db_circularity_property


async def update_circularity_properties(
    db: AsyncSession, product_id: int, circularity_properties: CircularityPropertiesUpdate
) -> CircularityProperties:
    """Update circularity properties for a product."""
    # Validate that product exists and has circularity properties
    product: Product = await db_get_model_with_id_if_it_exists(db, Product, product_id)
    if not (db_circularity_properties := product.circularity_properties):
        err_msg: EmailStr = f"Circularity properties for product with id {product_id} not found"
        raise ValueError(err_msg)

    circularity_properties_data: dict[str, Any] = circularity_properties.model_dump(exclude_unset=True)
    db_circularity_properties.sqlmodel_update(circularity_properties_data)

    db.add(db_circularity_properties)
    await db.commit()
    await db.refresh(db_circularity_properties)
    return db_circularity_properties


async def delete_circularity_properties(db: AsyncSession, product: Product) -> None:
    """Delete circularity properties for a product."""
    # Validate that product exists and has circularity properties
    if not (db_circularity_properties := product.circularity_properties):
        err_msg: EmailStr = f"Circularity properties for product with id {product.id} not found"
        raise ValueError(err_msg)

    await db.delete(db_circularity_properties)
    await db.commit()


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
        await db_get_model_with_id_if_it_exists(db, Product, parent_id)

    statement: SelectOfScalar[Product] = (
        select(Product)
        .where(Product.parent_id == parent_id)
        .options(selectinload(Product.components, recursion_depth=recursion_depth))
    )

    if product_filter:
        statement = product_filter.filter(statement)

    return (await db.exec(statement)).all()


# TODO: refactor this function and create_product to use a common function for creating components.
# See the category CRUD functions for an example.
async def create_component(
    db: AsyncSession,
    component: ComponentCreateWithComponents,
    parent_product_id: int,
    *,
    _is_recursive_call: bool = False,  # Flag to track recursive calls
    owner_id: UUID4 | None = None,
) -> Product:
    """Add a component to a product."""
    # Validate bill of materials
    if not component.bill_of_materials and not component.components:
        err_msg: str = "Product needs materials or components"
        raise ValueError(err_msg)

    if not _is_recursive_call:
        # Validate that parent product exists and fetch its owner ID
        db_parent_product = await db_get_model_with_id_if_it_exists(db, Product, parent_product_id)
        owner_id = db_parent_product.owner_id

    # Create component
    component_data: dict[str, Any] = component.model_dump(
        exclude={
            "components",
            "owner_id",
            "physical_properties",
            "circularity_properties",
            "videos",
            "bill_of_materials",
        }
    )
    db_component = Product(
        **component_data,
        parent_id=parent_product_id,
        owner_id=owner_id,
    )
    db.add(db_component)
    await db.flush()  # Assign component ID

    # Create properties
    if component.physical_properties:
        db_physical_property = PhysicalProperties(
            **component.physical_properties.model_dump(),
            product_id=db_component.id,
        )
        db.add(db_physical_property)

    if component.circularity_properties:
        db_circularity_property = CircularityProperties(
            **component.circularity_properties.model_dump(),
            product_id=db_component.id,
        )
        db.add(db_circularity_property)

    # Create videos
    if component.videos:
        for video in component.videos:
            db_video = Video(
                **video.model_dump(),
                product_id=db_component.id,
            )
            db.add(db_video)

    # Create bill of materials
    if component.bill_of_materials:
        # Validate materials exist
        material_ids = {material.material_id for material in component.bill_of_materials}
        await db_get_models_with_ids_if_they_exist(db, Material, material_ids)

        # Create material-product links
        db.add_all(
            MaterialProductLink(**material.model_dump(), product_id=db_component.id)
            for material in component.bill_of_materials
        )

    # Create subcomponents recursively
    if component.components:
        for subcomponent in component.components:
            await create_component(
                db,
                subcomponent,
                parent_product_id=db_component.id,  # ty: ignore[invalid-argument-type] # component ID is guaranteed by database flush above
                owner_id=owner_id,
                _is_recursive_call=True,
            )

    # Commit only when it's not a recursive call
    if not _is_recursive_call:
        await db.commit()
        await db.refresh(db_component)

    return db_component


async def create_product(
    db: AsyncSession,
    product: ProductCreateWithComponents,
    owner_id: UUID4,
) -> Product:
    """Create a new product in the database."""
    # Validate that product type exists
    if product.product_type_id:
        await db_get_model_with_id_if_it_exists(db, ProductType, product.product_type_id)

    # Validate that owner exists
    # TODO: Replace all these existence and auth checks with dependencies on the router level
    await db_get_model_with_id_if_it_exists(db, User, owner_id)

    # Create product
    product_data: dict[str, Any] = product.model_dump(
        exclude={
            "components",
            "physical_properties",
            "circularity_properties",
            "videos",
            "bill_of_materials",
        }
    )
    db_product = Product(**product_data, owner_id=owner_id)

    db.add(db_product)
    await db.flush()  # Assign product ID

    # Create properties
    if product.physical_properties:
        db_physical_properties = PhysicalProperties(
            **product.physical_properties.model_dump(),
            product_id=db_product.id,
        )
        db.add(db_physical_properties)

    if product.circularity_properties:
        db_circularity_properties = CircularityProperties(
            **product.circularity_properties.model_dump(),
            product_id=db_product.id,
        )
        db.add(db_circularity_properties)

    # Create videos
    if product.videos:
        for video in product.videos:
            db_video = Video(
                **video.model_dump(),
                product_id=db_product.id,
            )
            db.add(db_video)

    # Create bill of materials
    if product.bill_of_materials:
        # Validate materials exist
        material_ids: set[int] = {material.material_id for material in product.bill_of_materials}
        await db_get_models_with_ids_if_they_exist(db, Material, material_ids)

        # Create material-product links
        db.add_all(
            MaterialProductLink(**material.model_dump(), product_id=db_product.id)
            for material in product.bill_of_materials
        )

    # TODO: Support creation of images and files within product creation
    # Create components recursively
    if product.components:
        for component in product.components:
            await create_component(
                db,
                component,
                parent_product_id=db_product.id,  # ty: ignore[invalid-argument-type] # component ID is guaranteed by database flush above
                owner_id=owner_id,
                _is_recursive_call=True,
            )

    await db.commit()
    await db.refresh(db_product)
    return db_product


async def update_product(
    db: AsyncSession, product_id: int, product: ProductUpdate | ProductUpdateWithProperties
) -> Product:
    """Update an existing product in the database."""
    # TODO: Consider whether to have the CRUD layer take in  model objects (like db_product)
    # pre-fetched and pre-validated by dependencies at the router level, instead of fetching the
    # product by id on the CRUD layer, to reduce the load on the DB, for all RUD operations in the app

    # Validate that product exists
    db_product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    # Validate that product type exists
    if product.product_type_id:
        await db_get_model_with_id_if_it_exists(db, ProductType, product.product_type_id)

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

    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def delete_product(db: AsyncSession, product_id: int) -> None:
    """Delete a product from the database."""
    # Validate that product exists
    db_product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    # Delete stored files
    await product_files_crud.delete_all(db, product_id)
    await product_images_crud.delete_all(db, product_id)

    await db.delete(db_product)
    await db.commit()


## Product Storage operations ##
product_files_crud = ParentStorageOperations[Product, File, FileCreate, FileFilter](
    parent_model=Product,
    storage_model=File,
    parent_type=FileParentType.PRODUCT,
    parent_field="product_id",
    create_func=create_file,
    delete_func=delete_file,
)

product_images_crud = ParentStorageOperations[Product, Image, ImageCreateFromForm, ImageFilter](
    parent_model=Product,
    storage_model=Image,
    parent_type=ImageParentType.PRODUCT,
    parent_field="product_id",
    create_func=create_image,
    delete_func=delete_image,
)


## Bill of Materials operations ##
async def add_materials_to_product(
    db: AsyncSession, product_id: int, material_links: list[MaterialProductLinkCreateWithinProduct]
) -> list[MaterialProductLink]:
    """Add materials to a product."""
    # Validate that product exists
    db_product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    # Validate materials exist
    material_ids: set[int] = {material_link.material_id for material_link in material_links}
    await db_get_models_with_ids_if_they_exist(db, Material, material_ids)

    # Validate no duplicate materials
    if db_product.bill_of_materials:
        validate_no_duplicate_linked_items(material_ids, db_product.bill_of_materials, "Materials", "material_id")

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
            err_msg: str = "Material ID is required for this operation"
            raise ValueError(err_msg)

        # Cast to MaterialProductLinkCreateWithinProduct
        material_link = MaterialProductLinkCreateWithinProduct(material_id=material_id, **material_link.model_dump())

    # Add material link to product
    db_material_link_list: list[MaterialProductLink] = await add_materials_to_product(db, product_id, [material_link])

    if len(db_material_link_list) != 1:
        err_msg: str = (
            f"Database integrity error: Expected 1 material with id {material_link.material_id},"
            f" got {len(db_material_link_list)}"
        )
        raise RuntimeError(err_msg)

    return db_material_link_list[0]


async def update_material_within_product(
    db: AsyncSession, product_id: int, material_id: int, material_link: MaterialProductLinkUpdate
) -> MaterialProductLink:
    """Update material in a product bill of materials."""
    # Validate that product exists
    await db_get_model_with_id_if_it_exists(db, Product, product_id)

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
    db_material_link.sqlmodel_update(material_link.model_dump(exclude_unset=True))

    db.add(db_material_link)
    await db.commit()
    await db.refresh(db_material_link)
    return db_material_link


async def remove_materials_from_product(db: AsyncSession, product_id: int, material_ids: int | set[int]) -> None:
    """Remove materials from a product."""
    # Convert single material ID to list
    if isinstance(material_ids, int):
        material_ids = {material_ids}

    # Validate that product exists
    product = await db_get_model_with_id_if_it_exists(db, Product, product_id)

    # Validate materials exist
    await db_get_models_with_ids_if_they_exist(db, MaterialProductLink, material_ids)

    # Validate materials are actually assigned to the product
    validate_linked_items_exist(material_ids, product.bill_of_materials, "Materials", "material_id")

    statement: Delete = (
        delete(MaterialProductLink)
        .where(col(MaterialProductLink.product_id) == product_id)
        .where(col(MaterialProductLink.material_id).in_(material_ids))
    )
    await db.execute(statement)
    await db.commit()


### Ancillary Search CRUD operations ###
async def get_unique_product_brands(db: AsyncSession) -> list[str]:
    """Get all unique product brands."""
    statement = select(Product.brand).distinct().order_by(Product.brand).where(Product.brand.is_not(None))
    results = (await db.exec(statement)).all()
    unique_brands = sorted({brand.strip().title() for brand in results if brand and brand.strip()})
    return unique_brands
