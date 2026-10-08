"""Product writes and reads issue a query count that does not grow with the tree.

Each test runs one path at two sizes and asserts the statement counts are equal (or
grow only with the tree's depth), so a per-row query shows up as a failure.
"""

from typing import TYPE_CHECKING
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.api.application.account_erasure import erase_user
from app.api.auth.models import User
from app.api.data_collection.crud.product_commands import create_product, delete_product
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    MaterialProductLinkCreateWithinProduct,
    ProductCreateWithComponents,
)
from app.api.file_storage.models import File, MediaParentType, Video
from scripts.seed.factories.models import UserFactory
from tests.fixtures.queries import count_queries

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.reference_data.models import Material

pytestmark = pytest.mark.db


async def _seed_product(
    session: AsyncSession, owner: User, material: Material, *, components: int, depth: int = 1
) -> Product:
    """Seed a base product with ``components`` children per level, ``depth`` levels deep.

    Every row carries a bill-of-materials entry, a video and a file, so a per-row
    cascade has something to load.
    """
    root = Product(owner_id=owner.id, name="Scaling root")
    rows = level = [root]
    for _ in range(depth):
        level = [
            Product(owner_id=owner.id, name="Scaling component", parent=parent, amount_in_parent=1)
            for parent in level
            for _ in range(components if parent is root else 1)
        ]
        rows = rows + level
    session.add(root)
    await session.flush()
    for row in rows:
        session.add(MaterialProductLink(product_id=row.id, material_id=material.id, quantity=1.0))
        session.add(Video(product_id=row.id, url="https://example.com/video"))
        session.add(File(filename="notes.txt", file="notes.txt", parent_type=MediaParentType.PRODUCT, parent_id=row.id))
    await session.flush()
    session.expunge_all()
    return root


async def _count_delete(session: AsyncSession, product_id: int) -> tuple[int, int]:
    """Delete a product; return the statement count and how many media files were cleaned up."""
    with (
        patch("app.api.data_collection.crud.product_commands.audit_event"),
        patch("app.api.data_collection.crud.product_commands.cleanup_product_media_storage") as cleanup,
        count_queries() as statements,
    ):
        await delete_product(session, product_id)
    return len(statements), len(cleanup.call_args.args[0])


async def _remaining_rows(session: AsyncSession, owner: User) -> int:
    return (await session.execute(select(func.count()).where(Product.owner_id == owner.id))).scalar_one()


async def test_product_delete_query_count_does_not_grow_with_components(
    db_session: AsyncSession, db_user: User, db_superuser: User, db_material: Material
) -> None:
    """Deleting a product with 50 components takes as many queries as one with 5."""
    small = await _seed_product(db_session, db_user, db_material, components=5)
    large = await _seed_product(db_session, db_superuser, db_material, components=50)

    small_count, small_cleaned = await _count_delete(db_session, small.id)
    large_count, large_cleaned = await _count_delete(db_session, large.id)

    assert small_count == large_count
    # Every component's media is still staged for storage cleanup.
    assert (small_cleaned, large_cleaned) == (6, 51)
    assert await _remaining_rows(db_session, db_user) == 0
    assert await _remaining_rows(db_session, db_superuser) == 0


async def _count_erasure(session: AsyncSession, material: Material, *, products: int) -> int:
    """Erase a user owning ``products`` base products with content=delete; return the statement count."""
    user = await UserFactory.create_async(session=session, is_active=True, is_superuser=False)
    for _ in range(products):
        await _seed_product(session, user, material, components=2)
    user = await session.get(User, user.id)
    with patch("app.api.application.account_erasure.audit_event") as audit, count_queries() as statements:
        await erase_user(session, user, actor_id=uuid4(), content="delete")
    assert audit.call_count == products, "each deleted base product is audited"
    assert await _remaining_rows(session, user) == 0
    return len(statements)


async def test_erasure_query_count_does_not_grow_with_products(db_session: AsyncSession, db_material: Material) -> None:
    """Erasing a user with 30 products and content=delete takes as many queries as with 3."""
    assert await _count_erasure(db_session, db_material, products=3) == await _count_erasure(
        db_session, db_material, products=30
    )


def _product_payload(material: Material, *, components: int) -> ProductCreateWithComponents:
    """A base product with ``components`` components, each with one part, all with a bill of materials."""
    bom = [MaterialProductLinkCreateWithinProduct(material_id=material.id, quantity=1.0)]
    part = ComponentCreateWithComponents(name="Scaling part", amount_in_parent=1, bill_of_materials=bom)
    return ProductCreateWithComponents(
        name="Scaling create",
        bill_of_materials=bom,
        components=[
            ComponentCreateWithComponents(
                name="Scaling component", amount_in_parent=1, bill_of_materials=bom, components=[part]
            )
            for _ in range(components)
        ],
    )


async def _count_create(session: AsyncSession, owner: User, material: Material, *, components: int) -> int:
    payload = _product_payload(material, components=components)
    session.expunge_all()
    with count_queries() as statements:
        product = await create_product(session, payload, owner.id)
    assert await _remaining_rows(session, owner) == 1 + 2 * components
    with patch("app.api.data_collection.crud.product_commands.audit_event"):
        await delete_product(session, product.id)
    return len(statements)


async def test_product_tree_create_query_count_does_not_grow_with_components(
    db_session: AsyncSession, db_user: User, db_material: Material
) -> None:
    """Creating 30 components with bills of materials takes as many queries as 3."""
    small = await _count_create(db_session, db_user, db_material, components=3)
    large = await _count_create(db_session, db_user, db_material, components=30)
    assert small == large
