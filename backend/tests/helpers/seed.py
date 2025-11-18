"""Database seeding utilities for tests."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import (
    CategoryFactory,
    CompleteProductFactory,
    MaterialFactory,
    OrganizationFactory,
    ProductFactory,
    ProductTypeFactory,
    TaxonomyFactory,
    UserFactory,
)


async def seed_users(session: AsyncSession, count: int = 5) -> list[Any]:
    """Seed the database with test users.

    Args:
        session: Database session
        count: Number of users to create

    Returns:
        List of created users
    """
    UserFactory._meta.sqlalchemy_session = session
    return [UserFactory.create() for _ in range(count)]


async def seed_organizations(session: AsyncSession, count: int = 3) -> list[Any]:
    """Seed the database with test organizations.

    Args:
        session: Database session
        count: Number of organizations to create

    Returns:
        List of created organizations
    """
    OrganizationFactory._meta.sqlalchemy_session = session
    return [OrganizationFactory.create() for _ in range(count)]


async def seed_products(session: AsyncSession, owner: Any | None = None, count: int = 10) -> list[Any]:
    """Seed the database with test products.

    Args:
        session: Database session
        owner: User who owns the products (creates one if not provided)
        count: Number of products to create

    Returns:
        List of created products
    """
    ProductFactory._meta.sqlalchemy_session = session
    UserFactory._meta.sqlalchemy_session = session

    if owner is None:
        owner = UserFactory.create()

    return [ProductFactory.create(owner=owner) for _ in range(count)]


async def seed_complete_products(session: AsyncSession, owner: Any | None = None, count: int = 5) -> list[Any]:
    """Seed the database with complete products (with all properties).

    Args:
        session: Database session
        owner: User who owns the products (creates one if not provided)
        count: Number of complete products to create

    Returns:
        List of created complete products
    """
    CompleteProductFactory._meta.sqlalchemy_session = session
    UserFactory._meta.sqlalchemy_session = session

    if owner is None:
        owner = UserFactory.create()

    return [CompleteProductFactory.create(owner=owner) for _ in range(count)]


async def seed_taxonomies(session: AsyncSession, count: int = 3) -> list[Any]:
    """Seed the database with test taxonomies.

    Args:
        session: Database session
        count: Number of taxonomies to create

    Returns:
        List of created taxonomies
    """
    TaxonomyFactory._meta.sqlalchemy_session = session
    return [TaxonomyFactory.create() for _ in range(count)]


async def seed_materials(session: AsyncSession, count: int = 10) -> list[Any]:
    """Seed the database with test materials.

    Args:
        session: Database session
        count: Number of materials to create

    Returns:
        List of created materials
    """
    MaterialFactory._meta.sqlalchemy_session = session
    TaxonomyFactory._meta.sqlalchemy_session = session
    return [MaterialFactory.create() for _ in range(count)]


async def seed_product_types(session: AsyncSession, count: int = 8) -> list[Any]:
    """Seed the database with test product types.

    Args:
        session: Database session
        count: Number of product types to create

    Returns:
        List of created product types
    """
    ProductTypeFactory._meta.sqlalchemy_session = session
    TaxonomyFactory._meta.sqlalchemy_session = session
    return [ProductTypeFactory.create() for _ in range(count)]


async def seed_all_background_data(session: AsyncSession) -> dict[str, list[Any]]:
    """Seed the database with all background data.

    Args:
        session: Database session

    Returns:
        Dictionary with all created background data
    """
    return {
        "taxonomies": await seed_taxonomies(session, count=3),
        "materials": await seed_materials(session, count=10),
        "product_types": await seed_product_types(session, count=8),
    }


async def seed_full_test_database(session: AsyncSession) -> dict[str, Any]:
    """Seed the database with a full set of realistic test data.

    This creates a comprehensive test dataset including:
    - Users and organizations
    - Products with properties
    - Background data (taxonomies, materials, product types)

    Args:
        session: Database session

    Returns:
        Dictionary with all created data
    """
    # Set all factories to use the provided session
    UserFactory._meta.sqlalchemy_session = session
    OrganizationFactory._meta.sqlalchemy_session = session
    ProductFactory._meta.sqlalchemy_session = session
    CompleteProductFactory._meta.sqlalchemy_session = session
    TaxonomyFactory._meta.sqlalchemy_session = session
    MaterialFactory._meta.sqlalchemy_session = session
    ProductTypeFactory._meta.sqlalchemy_session = session

    # Create organizations
    orgs = await seed_organizations(session, count=3)

    # Create users (some with organizations)
    users = await seed_users(session, count=10)
    users[0].organization = orgs[0]
    users[1].organization = orgs[0]
    users[2].organization = orgs[1]

    # Create background data
    background_data = await seed_all_background_data(session)

    # Create products for each user
    all_products = []
    for user in users[:5]:  # First 5 users get products
        products = await seed_products(session, owner=user, count=5)
        all_products.extend(products)

    # Create some complete products (with all properties)
    complete_products = await seed_complete_products(session, owner=users[0], count=3)

    return {
        "organizations": orgs,
        "users": users,
        "products": all_products,
        "complete_products": complete_products,
        "background_data": background_data,
    }
