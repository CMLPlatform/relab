"""Shared helpers for reference-data CRUD operations."""

from typing import TYPE_CHECKING, Any, cast  # lgtm[py/unused-import]

from app.api.common.crud.persistence import SupportsModelDump, delete_and_commit, update_and_commit
from app.api.common.crud.query import require_locked_model, require_model
from app.api.reference_data.models import (
    Category,
    Material,
    ProductType,
    Taxonomy,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def create_reference_model[ModelT: Taxonomy | Material | ProductType](
    db: AsyncSession,
    model: type[ModelT],
    payload: SupportsModelDump,
    *,
    exclude_fields: set[str],
) -> ModelT:
    """Create and flush a reference-data model from a request payload."""
    model_data = cast("dict[str, Any]", payload.model_dump(exclude=exclude_fields))
    db_model = model(**model_data)
    db.add(db_model)
    await db.flush()
    return db_model


async def update_reference_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
    payload: SupportsModelDump,
) -> ModelT:
    """Apply a partial update and persist the model."""
    db_model: ModelT = await require_model(db, model, model_id)
    return await update_and_commit(db, db_model, payload)


async def delete_reference_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
) -> ModelT:
    """Delete a model after resolving it from the database."""
    db_model: ModelT = await require_locked_model(db, model, model_id)
    await delete_and_commit(db, db_model)
    return db_model
