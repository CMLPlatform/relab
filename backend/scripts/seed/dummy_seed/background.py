"""Dummy background-data seeding."""

from __future__ import annotations

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
)

from .data import category_data, material_data, product_type_data, taxonomy_data


async def seed_taxonomies(session: AsyncSession) -> dict[str, Taxonomy]:
    """Seed the database with sample taxonomy data."""
    taxonomy_map: dict[str, Taxonomy] = {}
    for data in taxonomy_data:
        stmt = select(Taxonomy).where(Taxonomy.name == data["name"])
        existing = (await session.exec(stmt)).first()

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
    category_map: dict[str, Category] = {}
    for data in category_data:
        taxonomy = taxonomy_map.get(data["taxonomy_name"])
        if not taxonomy:
            continue

        stmt = select(Category).where(Category.name == data["name"]).where(Category.taxonomy_id == taxonomy.id)
        existing = (await session.exec(stmt)).first()

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
    material_map: dict[str, Material] = {}
    for data in material_data:
        stmt = select(Material).where(Material.name == data["name"])
        existing = (await session.exec(stmt)).first()

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

        for category_name in data["categories"]:
            category = category_map.get(category_name)
            if category and category.id and material.id:
                stmt = select(CategoryMaterialLink).where(
                    CategoryMaterialLink.material_id == material.id, CategoryMaterialLink.category_id == category.id
                )
                if not (await session.exec(stmt)).first():
                    session.add(CategoryMaterialLink(material_id=material.id, category_id=category.id))
        await session.commit()
        material_map[material.name] = material
    return material_map


async def seed_product_types(session: AsyncSession, category_map: dict[str, Category]) -> dict[str, ProductType]:
    """Seed the database with sample product type data."""
    product_type_map: dict[str, ProductType] = {}
    for data in product_type_data:
        stmt = select(ProductType).where(ProductType.name == data["name"])
        existing = (await session.exec(stmt)).first()
        if existing:
            product_type_map[existing.name] = existing
            continue

        product_type = ProductType(
            name=data["name"],
            description=data["description"],
        )
        session.add(product_type)
        await session.commit()
        await session.refresh(product_type)

        for category_name in data["categories"]:
            category = category_map.get(category_name)
            if category and category.id and product_type.id:
                session.add(CategoryProductTypeLink(product_type_id=product_type.id, category_id=category.id))
        await session.commit()
        product_type_map[product_type.name] = product_type
    return product_type_map
