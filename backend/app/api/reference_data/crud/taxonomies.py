"""Taxonomy CRUD operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.persistence import commit_and_refresh
from app.api.reference_data.models import Taxonomy
from app.api.reference_data.schemas import TaxonomyCreateWithCategories

from .categories import create_category
from .persistence import create_reference_model


async def create_taxonomy(db: AsyncSession, taxonomy: TaxonomyCreateWithCategories) -> Taxonomy:
    """Create a new taxonomy in the database."""
    db_taxonomy = await create_reference_model(db, Taxonomy, taxonomy, exclude_fields={"categories"})

    if taxonomy.categories:
        for category_data in taxonomy.categories:
            await create_category(db, category_data, taxonomy_id=db_taxonomy.id)

    return await commit_and_refresh(db, db_taxonomy, add_before_commit=False)
