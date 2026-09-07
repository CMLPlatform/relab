"""Ownership validation helpers shared across API modules."""

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError

if TYPE_CHECKING:
    from uuid import UUID

    from app.api.common.models.base import Base


async def get_user_owned_object[MT: Base](
    db: AsyncSession,
    model: type[MT],
    model_id: int | UUID,
    owner_id: UUID4,
    user_fk: str = "owner_id",
) -> MT:
    """Load a model instance only from the current user's owned scope."""
    model_id_column = inspect(model).primary_key[0]
    owner_id_column = getattr(model, user_fk)
    statement = select(model).where(model_id_column == model_id, owner_id_column == owner_id)
    db_model = (await db.execute(statement)).scalars().unique().one_or_none()
    if db_model is None:
        raise ModelNotFoundError(model, model_id)
    return db_model
