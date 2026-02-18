#!/usr/bin/env python3

"""Seed the database with sample data for testing purposes."""

import argparse
import asyncio
import contextlib
import io
import logging
import mimetypes
from pathlib import Path

import anyio
from fastapi import UploadFile
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.datastructures import Headers

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.utils.programmatic_user_crud import create_user
from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)
from app.api.common.models.associations import (
    MaterialProductLink,
)
from app.api.common.models.enums import Unit
from app.api.data_collection.models import PhysicalProperties, Product
from app.api.file_storage.crud import create_image
from app.api.file_storage.models.models import ImageParentType
from app.api.file_storage.schemas import ImageCreateFromForm
from app.core.config import settings
from app.core.database import async_engine, get_async_session

# Set up logging
logger: logging.Logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

### Sample Data ###
# TODO: Add organization and Camera models

# Sample data for Users
user_data = [
    {
        "email": "alice@example.com",
        "password": "fake_password_1",
        "username": "alice",
    },
    {
        "email": "bob@example.com",
        "password": "fake_password_2",
        "username": "bob",
    },
]


# Sample data for Taxonomies
taxonomy_data = [
    {
        "name": "Electronics Taxonomy",
        "description": "Taxonomy for electronic products.",
        "version": "1.0",
        "domains": {TaxonomyDomain.PRODUCTS},
        "source": "https://example.com/electronics-taxonomy",
    },
    {
        "name": "Materials Taxonomy",
        "description": "Taxonomy for materials.",
        "version": "1.0",
        "domains": {TaxonomyDomain.MATERIALS},
        "source": "https://example.com/materials-taxonomy",
    },
]

# Sample data for Categories
category_data = [
    {
        "name": "Smartphones",
        "description": "Category for smartphones.",
        "taxonomy_name": "Electronics Taxonomy",
    },
    {
        "name": "Laptops",
        "description": "Category for laptops.",
        "taxonomy_name": "Electronics Taxonomy",
    },
    {
        "name": "Metals",
        "description": "Category for metals.",
        "taxonomy_name": "Materials Taxonomy",
    },
    {
        "name": "Plastics",
        "description": "Category for plastics.",
        "taxonomy_name": "Materials Taxonomy",
    },
]

# Sample data for Materials
material_data = [
    {
        "name": "Aluminum",
        "description": "Lightweight metal.",
        "source": "https://example.com/aluminum",
        "density_kg_m3": 2700,
        "is_crm": False,
        "categories": ["Metals"],
    },
    {
        "name": "Polycarbonate",
        "description": "Durable plastic.",
        "source": "https://example.com/polycarbonate",
        "density_kg_m3": 1200,
        "is_crm": False,
        "categories": ["Plastics"],
    },
]

# Sample data for Product Types
product_type_data = [
    {
        "name": "Smartphone",
        "description": "A handheld personal computer.",
        "categories": ["Smartphones"],
    },
    {
        "name": "Laptop",
        "description": "A portable personal computer.",
        "categories": ["Laptops"],
    },
]

# Sample data for Products
product_data = [
    {
        "name": "iPhone 12",
        "description": "Apple smartphone.",
        "brand": "Apple",
        "model": "A2403",
        "product_type_name": "Smartphone",
        "physical_properties": {
            "weight_g": 164,
            "height_cm": 14.7,
            "width_cm": 7.15,
            "depth_cm": 0.74,
        },
        "bill_of_materials": [
            {"material": "Aluminum", "quantity": 0.025, "unit": Unit.KILOGRAM},
            {"material": "Polycarbonate", "quantity": 0.050, "unit": Unit.KILOGRAM},
        ],
    },
    {
        "name": "Dell XPS 13",
        "description": "Dell laptop.",
        "brand": "Dell",
        "model": "XPS9380",
        "product_type_name": "Laptop",
        "physical_properties": {
            "weight_g": 1230,
            "height_cm": 1.16,
            "width_cm": 30.2,
            "depth_cm": 19.9,
        },
        "bill_of_materials": [
            {"material": "Aluminum", "quantity": 0.5, "unit": Unit.KILOGRAM},
            {"material": "Polycarbonate", "quantity": 0.3, "unit": Unit.KILOGRAM},
        ],
    },
]

# Sample data for Images
image_data: list[dict[str, str]] = [
    {
        "description": "Example phone image",
        "path": str(settings.static_files_path / "images" / "example_phone.jpg"),
        "parent_product_name": "iPhone 12",
    }
]


### Async Functions ###
async def reset_db() -> None:
    """Reset the database by dropping and recreating all tables."""
    logger.info("Resetting database...")
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database reset successfully.")


async def seed_users(session: AsyncSession) -> dict[str, User]:
    """Seed the database with sample user data."""
    user_map = {}
    for user_dict in user_data:
        # Check if user exists
        stmt = select(User).where(User.email == user_dict["email"])
        result = await session.exec(stmt)
        existing_user = result.first()

        if existing_user:
            logger.info(f"User {user_dict['email']} already exists, skipping creation.")
            user_map[existing_user.email] = existing_user
            continue

        user_create = UserCreate(
            email=user_dict["email"],
            password=user_dict["password"],
            username=user_dict["username"],
            is_superuser=False,
            is_verified=True,
        )
        # We need to catch UserAlreadyExists here too technically, but the check above handles clean runs
        # create_user handles hashing
        try:
            user = await create_user(session, user_create, send_registration_email=False)
            user_map[user.email] = user
        except Exception as e:
            logger.warning(f"Failed to create user {user_dict['email']}: {e}")
            # Try to fetch again just in case
            stmt = select(User).where(User.email == user_dict["email"])
            result = await session.exec(stmt)
            user_map[user_dict["email"]] = result.first()

    return user_map


async def seed_taxonomies(session: AsyncSession) -> dict[str, Taxonomy]:
    """Seed the database with sample taxonomy data."""
    taxonomy_map = {}
    for data in taxonomy_data:
        # Check existence
        stmt = select(Taxonomy).where(Taxonomy.name == data["name"])
        result = await session.exec(stmt)
        existing = result.first()

        if existing:
            taxonomy_map[existing.name] = existing
            continue

        taxonomy = Taxonomy(
            name=data["name"],
            version=data["version"],
            description=data["description"],
            domains=data["domains"],
            source=data["source"],
        )
        session.add(taxonomy)
        await session.commit()
        await session.refresh(taxonomy)
        taxonomy_map[taxonomy.name] = taxonomy
    return taxonomy_map


async def seed_categories(session: AsyncSession, taxonomy_map: dict[str, Taxonomy]) -> dict[str, Category]:
    """Seed the database with sample category data."""
    category_map = {}
    for data in category_data:
        taxonomy = taxonomy_map.get(data["taxonomy_name"])
        if not taxonomy:
            continue

        # Check existence by name and taxonomy
        stmt = select(Category).where(Category.name == data["name"]).where(Category.taxonomy_id == taxonomy.id)
        result = await session.exec(stmt)
        existing = result.first()

        if existing:
            category_map[existing.name] = existing
            continue

        if taxonomy.id:
            category = Category(name=data["name"], description=data["description"], taxonomy_id=taxonomy.id)
            session.add(category)
            await session.commit()
            await session.refresh(category)
            category_map[category.name] = category
    return category_map


async def seed_materials(session: AsyncSession, category_map: dict[str, Category]) -> dict[str, Material]:
    """Seed the database with sample material data."""
    material_map = {}
    for data in material_data:
        stmt = select(Material).where(Material.name == data["name"])
        result = await session.exec(stmt)
        existing = result.first()

        if existing:
            material_map[existing.name] = existing
            continue

        material = Material(
            name=data["name"],
            description=data["description"],
            source=data["source"],
            density_kg_m3=data["density_kg_m3"],
            is_crm=data["is_crm"],
        )
        session.add(material)
        await session.commit()
        await session.refresh(material)

        # Associate material with categories
        for category_name in data["categories"]:
            category = category_map.get(category_name)
            if category and category.id and material.id:
                # Check link existence
                stmt = select(CategoryMaterialLink).where(
                    CategoryMaterialLink.material_id == material.id, CategoryMaterialLink.category_id == category.id
                )
                if not (await session.exec(stmt)).first():
                    link = CategoryMaterialLink(material_id=material.id, category_id=category.id)
                    session.add(link)
        await session.commit()
        material_map[material.name] = material
    return material_map


async def seed_product_types(session: AsyncSession, category_map: dict[str, Category]) -> dict[str, ProductType]:
    """Seed the database with sample product type data."""
    product_type_map = {}
    for data in product_type_data:
        stmt = select(ProductType).where(ProductType.name == data["name"])
        if (await session.exec(stmt)).first():
            # fetch existing
            stmt = select(ProductType).where(ProductType.name == data["name"])
            product_type = (await session.exec(stmt)).first()
            product_type_map[product_type.name] = product_type
            continue

        product_type = ProductType(
            name=data["name"],
            description=data["description"],
        )
        session.add(product_type)
        await session.commit()
        await session.refresh(product_type)

        # Associate product type with categories
        for category_name in data["categories"]:
            category = category_map.get(category_name)
            if category and category.id and product_type.id:
                link = CategoryProductTypeLink(product_type_id=product_type.id, category_id=category.id)
                session.add(link)
        await session.commit()
        product_type_map[product_type.name] = product_type
    return product_type_map


async def seed_products(
    session: AsyncSession,
    product_type_map: dict[str, ProductType],
    material_map: dict[str, Material],
    user_map: dict[str, User],
) -> dict[str, Product]:
    """Seed the database with sample product data."""
    product_map = {}
    for data in product_data:
        if data["name"] in product_map:
            continue  # simplistic check

        stmt = select(Product).where(Product.name == data["name"])
        existing = (await session.exec(stmt)).first()
        if existing:
            product_map[existing.name] = existing
            continue

        product_type = product_type_map.get(data["product_type_name"])
        if not product_type:
            continue

        user = next(iter(user_map.values()), None)
        if not user:
            continue

        # Create product first
        product = Product(
            name=data["name"],
            description=data["description"],
            brand=data["brand"],
            model=data["model"],
            product_type_id=product_type.id,
            owner_id=user.id,
        )
        session.add(product)
        await session.commit()
        await session.refresh(product)  # Ensures ID for product

        # Now create physical properties with product_id
        physical_props = PhysicalProperties(**data["physical_properties"], product_id=product.id)  # ty: ignore[invalid-argument-type] # properties ID is guaranteed by database flush above
        session.add(physical_props)
        await session.commit()

        # Add bill of materials
        for material_data in data["bill_of_materials"]:
            material = material_map.get(material_data["material"])
            if material and material.id and product.id:
                link = MaterialProductLink(
                    material_id=material.id,
                    product_id=product.id,
                    quantity=material_data["quantity"],
                    unit=material_data["unit"],
                )
                session.add(link)

        await session.commit()
        product_map[product.name] = product
    return product_map


async def seed_images(session: AsyncSession, product_map: dict[str, Product]) -> None:
    """Seed the database with initial image data."""
    for data in image_data:
        path: Path = Path(data.get("path", None))

        # Check if file exists to avoid crashes
        if not path.exists():
            logger.warning(f"Image not found at {path}, skipping.")
            continue

        description: str = data.get("description", "")

        parent_type = ImageParentType.PRODUCT
        parent = product_map.get(data["parent_product_name"])
        if parent:
            parent_id = parent.id

            # crude check for existence: verify if any image for this parent has this description
            # (better would be filename check but filename is inside database file path)
            # For now, we skip if we are not resetting, or we accept duplicate images if run twice.
            # Ideally checking checksums. But let's assume if we didn't reset, we might duplicate.
            # actually let's just skip for now to be safe.
        else:
            logger.warning("Skipping image %s: parent not found", path.name)
            continue

        filename: str = path.name
        async_path = anyio.Path(path)
        size: int = (await async_path.stat()).st_size
        mime_type, _ = mimetypes.guess_type(path)

        if mime_type is None:
            err_msg = f"Could not determine MIME type for image file {filename}."
            raise ValueError(err_msg)

        # Read file into memory
        async with await async_path.open("rb") as file:
            file_content = await file.read()

        # Create BytesIO object for UploadFile
        file_obj = io.BytesIO(file_content)
        upload_file = UploadFile(
            file=file_obj,
            filename=filename,
            size=size,
            headers=Headers(
                {
                    "filename": filename,
                    "size": str(size),
                    "content-type": mime_type,
                }
            ),
        )

        image_create = ImageCreateFromForm(
            description=description,
            file=upload_file,
            parent_id=parent_id,
            parent_type=parent_type,
        )
        await create_image(session, image_create)


async def async_main(reset: bool = False) -> None:
    """Seed the database with sample data."""
    if reset:
        await reset_db()

    get_async_session_context = contextlib.asynccontextmanager(get_async_session)

    async with get_async_session_context() as session:
        # Seed all data
        user_map = await seed_users(session)
        taxonomy_map = await seed_taxonomies(session)
        category_map = await seed_categories(session, taxonomy_map)
        material_map = await seed_materials(session, category_map)
        product_type_map = await seed_product_types(session, category_map)
        product_map = await seed_products(session, product_type_map, material_map, user_map)
        await seed_images(session, product_map)
        logger.info("Database seeded with test data.")


def main() -> None:
    """Run the async main function."""
    parser = argparse.ArgumentParser(description="Seed the database with dummy data.")
    parser.add_argument("--reset", action="store_true", help="Reset the database before seeding.")
    args = parser.parse_args()

    # Run async main
    asyncio.run(async_main(reset=args.reset))


if __name__ == "__main__":
    main()
