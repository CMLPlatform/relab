"""Ownership validation helpers shared across API modules."""

from pydantic import UUID4
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.common.crud.query import require_model
from app.api.common.models.custom_types import IDT, MT


async def get_user_owned_object(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    owner_id: UUID4,
    user_fk: str = "owner_id",
) -> MT:
    """Validate user ownership of a model instance with a many-to-one relationship."""
    db_model = await require_model(db, model, model_id)
    if getattr(db_model, user_fk) != owner_id:
        raise UserOwnershipError(model_type=model, model_id=model_id, user_id=owner_id)

    model_id_column = inspect(model).primary_key[0]
    owner_column = getattr(model, user_fk)
    statement = select(model).where(
        model_id_column == model_id,  # type: ignore[operator]
        owner_column == owner_id,  # type: ignore[operator]
    )
    owned = (await db.execute(statement)).scalars().unique().one_or_none()
    if owned is None:
        raise UserOwnershipError(model_type=model, model_id=model_id, user_id=owner_id)
    return owned
