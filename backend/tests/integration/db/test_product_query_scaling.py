"""Product writes and reads issue a query count that does not grow with the tree.

Each test runs one path at two sizes and asserts the statement counts are equal (or
grow only with the tree's depth), so a per-row query shows up as a failure.
"""

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.api.data_collection.crud.product_commands import delete_product
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.file_storage.models import File, MediaParentType, Video
from tests.fixtures.queries import count_queries

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
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
    level = [root]
    for _ in range(depth):
        level = [
            Product(owner_id=owner.id, name="Scaling component", parent=parent, amount_in_parent=1)
            for parent in level
            for _ in range(components if parent is root else 1)
        ]
    session.add(root)
    await session.flush()
    rows = (await session.execute(select(Product).where(Product.owner_id == owner.id))).scalars().all()
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
