"""Integration tests for reference-data CRUD helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy import select

from app.api.reference_data.crud.categorized_resources import MATERIAL_RESOURCE, create_categorized_reference
from app.api.reference_data.models import CategoryMaterialLink
from app.api.reference_data.schemas import MaterialCreateWithCategories
from tests.factories.models import CategoryFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.reference_data.models import Taxonomy

pytestmark = pytest.mark.db


async def test_create_categorized_material_persists_category_links(
    db_session: AsyncSession,
    db_taxonomy: Taxonomy,
) -> None:
    """Creating a categorized material should persist validated category links."""
    category = await CategoryFactory.create_async(db_session, taxonomy_id=db_taxonomy.id, name="Ferrous Metals")

    material = await create_categorized_reference(
        db_session,
        MATERIAL_RESOURCE,
        MaterialCreateWithCategories(name="Low Alloy Steel", category_ids={category.id}),
    )

    link = (
        await db_session.execute(
            select(CategoryMaterialLink).where(
                CategoryMaterialLink.material_id == material.id,
                CategoryMaterialLink.category_id == category.id,
            )
        )
    ).scalar_one()
    assert link.material_id == material.id
    assert link.category_id == category.id
