"""Integration tests for the category breakdown SQL.

Exercises `compute_categories` against a real database. The unit router tests
mock this function out, so without these the scope semantics are unverified --
which is how a category's count previously conflated top-level products with
components that merely shared a product type.
"""

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.data_collection.models.product import Product
from app.api.reference_data.models import ProductType
from app.api.stats.queries import compute_categories
from app.api.stats.schemas import CategoryScope

if TYPE_CHECKING:
    from httpx import AsyncClient


async def seed_laptop_teardown(db_session: AsyncSession, user: User) -> None:
    """Two laptops, one torn down into a PCB and a screw nested inside the PCB.

    A component carries its own product_type, so "Laptop" must count 2 (the
    top-level products) and never pick up the PCB or the screw.
    """
    laptop = ProductType(name="Laptop", description="Category scope test")
    pcb = ProductType(name="PCB", description="Category scope test")
    screw = ProductType(name="Screw", description="Category scope test")

    root_a = Product(owner_id=user.id, name="Laptop A", product_type=laptop, weight_g=2_000)
    root_b = Product(owner_id=user.id, name="Laptop B", product_type=laptop, weight_g=2_100)
    board = Product(
        owner_id=user.id,
        name="Mainboard",
        product_type=pcb,
        parent=root_a,
        amount_in_parent=1,
        weight_g=300,
    )
    # Nested one level deeper, to prove depth does not change the category.
    fastener = Product(
        owner_id=user.id,
        name="M2 screw",
        product_type=screw,
        parent=board,
        amount_in_parent=4,
        weight_g=1,
    )
    db_session.add_all([laptop, pcb, screw, root_a, root_b, board, fastener])
    await db_session.flush()


async def test_products_scope_counts_top_level_only(db_session: AsyncSession, db_superuser: User) -> None:
    """The default scope counts things that were torn down, not their innards."""
    await seed_laptop_teardown(db_session, db_superuser)

    categories, _ = await compute_categories(db_session, limit=25, scope=CategoryScope.PRODUCTS)

    assert [(c.name, c.count) for c in categories] == [("Laptop", 2)]


async def test_components_scope_counts_parts_by_their_own_type(
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """Components are categorised as what they are, not as the product they came from."""
    await seed_laptop_teardown(db_session, db_superuser)

    categories, _ = await compute_categories(db_session, limit=25, scope=CategoryScope.COMPONENTS)

    # Ordered by count DESC then name ASC; both have one row, so name breaks the tie.
    assert [(c.name, c.count) for c in categories] == [("PCB", 1), ("Screw", 1)]
    assert "Laptop" not in {c.name for c in categories}


async def test_all_scope_counts_both_populations(db_session: AsyncSession, db_superuser: User) -> None:
    """`all` is the union: every product row, categorised by its own type."""
    await seed_laptop_teardown(db_session, db_superuser)

    categories, _ = await compute_categories(db_session, limit=25, scope=CategoryScope.ALL)

    assert {c.name: c.count for c in categories} == {"Laptop": 2, "PCB": 1, "Screw": 1}


async def test_limit_caps_rows_and_keeps_the_largest(db_session: AsyncSession, db_superuser: User) -> None:
    """Ordering is count DESC, so a limit keeps the biggest categories."""
    await seed_laptop_teardown(db_session, db_superuser)

    categories, _ = await compute_categories(db_session, limit=1, scope=CategoryScope.ALL)

    assert [(c.name, c.count) for c in categories] == [("Laptop", 2)]


async def test_endpoint_defaults_to_products_and_honours_scope(
    db_session: AsyncSession,
    api_client: AsyncClient,
    db_superuser: User,
) -> None:
    """The scope query param reaches the SQL over HTTP, not just in isolation."""
    await seed_laptop_teardown(db_session, db_superuser)

    default = await api_client.get("/v1/stats/categories")
    assert default.status_code == 200
    assert default.json()["scope"] == "products"
    assert default.json()["categories"] == [{"name": "Laptop", "count": 2}]

    components = await api_client.get("/v1/stats/categories?scope=components")
    assert components.status_code == 200
    assert components.json()["categories"] == [{"name": "PCB", "count": 1}, {"name": "Screw", "count": 1}]


async def test_category_with_no_products_in_scope_is_absent(
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """A type with zero rows in the scope never reaches the client as a zero count."""
    orphan = ProductType(name="Never used", description="Category scope test")
    db_session.add(orphan)
    await seed_laptop_teardown(db_session, db_superuser)

    categories, _ = await compute_categories(db_session, limit=25, scope=CategoryScope.PRODUCTS)

    assert "Never used" not in {c.name for c in categories}
