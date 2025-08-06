#!/usr/bin/env python3

"""Seed the database with sample data for testing purposes."""

import asyncio
import contextlib
import logging
import mimetypes
from typing import TYPE_CHECKING

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
from app.core.database import get_async_session
from fastapi import UploadFile
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.datastructures import Headers

if TYPE_CHECKING:
    from pathlib import Path

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
        "domains": {TaxonomyDomain.PRODUCTS},
        "source": "https://example.com/electronics-taxonomy",
    },
    {
        "name": "Materials Taxonomy",
        "description": "Taxonomy for materials.",
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
            "weight_kg": 0.164,
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
            "weight_kg": 1.23,
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
image_data = [
    {
        "description": "Example phone image",
        "path": settings.static_files_path / "images" / "example_phone.jpg",
        "parent_product_name": "iPhone 12",
    }
]


### Async Functions ###
async def seed_users(session: AsyncSession) -> dict[str, User]:
    """Seed the database with sample user data."""
    user_map = {}
    for user_dict in user_data:
        user_create = UserCreate(
            email=user_dict["email"],
            password=user_dict["password"],
            username=user_dict["username"],
            is_superuser=False,
            is_verified=True,
        )
        user = await create_user(session, user_create, send_registration_email=False)
        user_map[user.email] = user
    return user_map


async def seed_taxonomies(session: AsyncSession) -> dict[str, Taxonomy]:
    """Seed the database with sample taxonomy data."""
    taxonomy_map = {}
    for data in taxonomy_data:
        taxonomy = Taxonomy(
            name=data["name"],
            description=data["description"],
            domains=data["domains"],
            source=data["source"],
        )
        session.add(taxonomy)
        await session.commit()
        taxonomy_map[taxonomy.name] = taxonomy
    return taxonomy_map


async def seed_categories(session: AsyncSession, taxonomy_map: dict[str, Taxonomy]) -> dict[str, Category]:
    """Seed the database with sample category data."""
    category_map = {}
    for data in category_data:
        taxonomy = taxonomy_map[data["taxonomy_name"]]
        if taxonomy.id:
            category = Category(name=data["name"], description=data["description"], taxonomy_id=taxonomy.id)
            session.add(category)
            await session.commit()
            category_map[category.name] = category
    return category_map


async def seed_materials(session: AsyncSession, category_map: dict[str, Category]) -> dict[str, Material]:
    """Seed the database with sample material data."""
    material_map = {}
    for data in material_data:
        material = Material(
            name=data["name"],
            description=data["description"],
            source=data["source"],
            density_kg_m3=data["density_kg_m3"],
            is_crm=data["is_crm"],
        )
        session.add(material)
        await session.commit()

        # Associate material with categories
        for category_name in data["categories"]:
            category = category_map[category_name]
            if category.id and material.id:
                link = CategoryMaterialLink(material_id=material.id, category_id=category.id)
                session.add(link)
        await session.commit()
        material_map[material.name] = material
    return material_map


async def seed_product_types(session: AsyncSession, category_map: dict[str, Category]) -> dict[str, ProductType]:
    """Seed the database with sample product type data."""
    product_type_map = {}
    for data in product_type_data:
        product_type = ProductType(
            name=data["name"],
            description=data["description"],
        )
        session.add(product_type)
        await session.commit()

        # Associate product type with categories
        for category_name in data["categories"]:
            category = category_map[category_name]
            if category.id and product_type.id:
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
        product_type = product_type_map[data["product_type_name"]]

        # Create product first
        product = Product(
            name=data["name"],
            description=data["description"],
            brand=data["brand"],
            model=data["model"],
            product_type_id=product_type.id,
            owner_id=next(iter(user_map.values())).id,  # pyright: ignore [reportArgumentType] # ID is guaranteed because these objects have been committed to the DB earlier.
        )
        session.add(product)
        await session.commit()
        await session.refresh(product)  # Ensures ID for product

        # Now create physical properties with product_id
        physical_props = PhysicalProperties(**data["physical_properties"], product_id=product.id)  # pyright: ignore [reportArgumentType] # ID is guaranteed because these objects have been committed to the DB earlier.
        session.add(physical_props)
        await session.commit()

        # Add bill of materials
        for material_data in data["bill_of_materials"]:
            material = material_map[material_data["material"]]
            if material.id and product.id:
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
        path: Path = data["path"]
        description: str = data["description"]

        parent_type = ImageParentType.PRODUCT
        parent = product_map.get(data["parent_product_name"])
        if parent:
            parent_id = parent.id
        else:
            logger.warning("Skipping image %s: parent not found", path.name)
            continue

        filename: str = path.name
        size: int = path.stat().st_size
        mime_type, _ = mimetypes.guess_type(path)

        if mime_type is None:
            err_msg = f"Could not determine MIME type for image file {filename}."
            raise ValueError(err_msg)

        with path.open("rb") as file:
            upload_file = UploadFile(
                file=file,
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


async def async_main() -> None:
    """Seed the database with sample data."""
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
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
