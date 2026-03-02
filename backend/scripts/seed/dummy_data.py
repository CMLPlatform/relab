#!/usr/bin/env python3

"""Seed the database with sample data for testing purposes."""

import argparse
import io
import json
import logging
import mimetypes
from functools import partial
from pathlib import Path

from alembic.config import Config
from anyio import Path as AnyIOPath
from anyio import run
from anyio.to_thread import run_sync
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.datastructures import Headers

from alembic import command
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
)
from app.api.common.models.associations import MaterialProductLink
from app.api.data_collection.models import PhysicalProperties, Product
from app.api.file_storage.crud import create_image
from app.api.file_storage.models.models import ImageParentType
from app.api.file_storage.schemas import ImageCreateFromForm
from app.core.config import settings
from app.core.logging import setup_logging

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)

# Database setup
DATABASE_URL = settings.async_database_url
engine = create_async_engine(DATABASE_URL, echo=False)


class DryRunAsyncSession(AsyncSession):
    """AsyncSession that flushes instead of committing for dry runs."""

    async def commit(self) -> None:
        """Override commit to flush instead for dry run mode."""
        await self.flush()


### Sample Data ###
# TODO: Add organization and Camera models


# Load data from json
data_file = Path(__file__).parent / "data.json"
with data_file.open("r") as f:
    _seed_data = json.load(f)

user_data = _seed_data["user_data"]
taxonomy_data = _seed_data["taxonomy_data"]
category_data = _seed_data["category_data"]
material_data = _seed_data["material_data"]
product_type_data = _seed_data["product_type_data"]
product_data = _seed_data["product_data"]
image_data = _seed_data["image_data"]


### Async Functions ###
async def seed_users(session: AsyncSession) -> dict[str, User]:
    """Seed the database with sample user data."""
    user_map = {}
    for user_dict in user_data:
        # Check if user exists
        stmt = select(User).where(User.email == user_dict["email"])
        result = await session.exec(stmt)
        existing_user = result.first()

        if existing_user:
            logger.info("User %s already exists, skipping creation.", user_dict["email"])
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
        except ValueError as e:
            logger.warning("Failed to create user %s: %s", user_dict["email"], e)
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
            product_type_fetched = (await session.exec(stmt)).first()
            if product_type_fetched:
                product_type_map[product_type_fetched.name] = product_type_fetched
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
        if not user or not user.id:
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

        if not product.id:
            continue

        # Now create physical properties with product_id
        physical_props = PhysicalProperties(**data["physical_properties"], product_id=product.id)
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
        filename = data.get("filename")
        if not filename:
            continue
        path: Path = settings.static_files_path / "images" / filename

        # Check if file exists to avoid crashes
        async_path = AnyIOPath(path)
        if not await async_path.is_file():
            logger.warning("Image not found at %s, skipping.", path)
            continue

        description: str = data.get("description", "")

        parent_type = ImageParentType.PRODUCT
        parent = product_map.get(data["parent_product_name"])
        if parent and parent.id:
            parent_id = parent.id
        else:
            logger.warning("Skipping image %s: parent not found", path.name)
            continue

        filename: str = path.name
        async_path = AnyIOPath(path)
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


async def reset_db() -> None:
    """Reset the database using Alembic."""
    logger.info("Resetting database with Alembic...")

    # Run alembic in a synchronous thread since it's fundamentally synchronous
    def run_alembic_reset() -> None:
        # Add project root to path to allow imports when running as a standalone script
        project_root = Path(__file__).resolve().parents[2]
        alembic_cfg = Config(toml_file=str(project_root / "pyproject.toml"))
        command.downgrade(alembic_cfg, "base")
        command.upgrade(alembic_cfg, "head")

    await run_sync(run_alembic_reset)
    logger.info("Database reset successfully.")


async def async_main(*, reset: bool = False, dry_run: bool = False) -> None:
    """Seed the database with sample data."""
    if dry_run and reset:
        logger.warning("Dry run requested; skipping reset to avoid destructive changes.")
        reset = False

    if reset:
        await reset_db()

    session_class = DryRunAsyncSession if dry_run else AsyncSession
    session_factory = async_sessionmaker(engine, class_=session_class, expire_on_commit=False)

    async with session_factory() as session:
        # Seed all data
        user_map = await seed_users(session)
        taxonomy_map = await seed_taxonomies(session)
        category_map = await seed_categories(session, taxonomy_map)
        material_map = await seed_materials(session, category_map)
        product_type_map = await seed_product_types(session, category_map)
        product_map = await seed_products(session, product_type_map, material_map, user_map)
        await seed_images(session, product_map)
        if dry_run:
            await session.rollback()
            logger.info("Dry run complete; all changes rolled back.")
        else:
            logger.info("Database seeded with test data.")

    await engine.dispose()


def main() -> None:
    """Run the async main function."""
    parser = argparse.ArgumentParser(description="Seed the database with dummy data.")
    parser.add_argument("--reset", action="store_true", help="Reset the database before seeding.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Seed data but rollback the transaction instead of committing."
    )
    args = parser.parse_args()

    # Run async main
    run(partial(async_main, reset=args.reset, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
