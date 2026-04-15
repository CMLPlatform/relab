"""Ownership validation helpers shared across API modules."""

from pydantic import UUID4
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.models.custom_types import IDT, MT


async def get_user_owned_object(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    owner_id: UUID4,
    user_fk: str = "owner_id",
) -> MT:
    """Validate user ownership of a model instance with a many-to-one relationship."""
    model_id_column = inspect(model).primary_key[0]
    statement = select(model).where(model_id_column == model_id)  # type: ignore[operator]
    db_model = (await db.execute(statement)).scalars().unique().one_or_none()
    if db_model is None:
        raise ModelNotFoundError(model, model_id)
    if getattr(db_model, user_fk) != owner_id:
        raise UserOwnershipError(model_type=model, model_id=model_id, user_id=owner_id)
    return db_model
