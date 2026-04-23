"""Taxonomy CRUD operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Taxonomy
from app.api.background_data.schemas import TaxonomyCreate, TaxonomyCreateWithCategories, TaxonomyUpdate
from app.api.common.crud.persistence import commit_and_refresh

from .categories import create_category
from .shared import create_background_model, delete_background_model, update_background_model


async def create_taxonomy(db: AsyncSession, taxonomy: TaxonomyCreate | TaxonomyCreateWithCategories) -> Taxonomy:
    """Create a new taxonomy in the database."""
    db_taxonomy = await create_background_model(db, Taxonomy, taxonomy, exclude_fields={"categories"})

    if isinstance(taxonomy, TaxonomyCreateWithCategories) and taxonomy.categories:
        for category_data in taxonomy.categories:
            await create_category(db, category_data, taxonomy_id=db_taxonomy.id)

    return await commit_and_refresh(db, db_taxonomy, add_before_commit=False)


async def update_taxonomy(db: AsyncSession, taxonomy_id: int, taxonomy: TaxonomyUpdate) -> Taxonomy:
    """Update an existing taxonomy in the database."""
    return await update_background_model(db, Taxonomy, taxonomy_id, taxonomy)


async def delete_taxonomy(db: AsyncSession, taxonomy_id: int) -> None:
    """Delete a taxonomy from the database, including its categories."""
    await delete_background_model(db, Taxonomy, taxonomy_id)
