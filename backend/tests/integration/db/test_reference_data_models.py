"""Integration tests for reference-data persistence and relationships."""

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.reference_data.models import Category, Taxonomy
from tests.factories.models import CategoryFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.db


async def test_deleting_taxonomy_cascades_categories(db_session: AsyncSession, db_taxonomy: Taxonomy) -> None:
    """Deleting a taxonomy should remove its categories."""
    category = await CategoryFactory.create_async(db_session, name="Test Category", taxonomy_id=db_taxonomy.id)
    category_id = category.id

    await db_session.delete(db_taxonomy)
    await db_session.flush()

    assert await db_session.get(Category, category_id) is None


async def test_category_requires_taxonomy(db_session: AsyncSession) -> None:
    """Categories should fail without a taxonomy foreign key."""
    category = CategoryFactory.build(name="Invalid Category")
    db_session.add(category)

    with pytest.raises(IntegrityError, match="taxonomy_id"):
        await db_session.flush()
