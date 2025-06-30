"""Utility functions for validating user ownership of model instances."""

from pydantic import UUID4
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.exceptions import UserOwnershipError
from app.api.auth.models import User
from app.api.common.crud.base import get_nested_model_by_id
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.models.custom_types import IDT, MT


async def get_user_owned_object(
    db: AsyncSession,
    model: type[MT],
    model_id: IDT,
    owner_id: UUID4,
    user_fk: str = "owner_id",
) -> MT:
    """Validate user ownership of a model instance with a many-to-one relationship."""
    try:
        return await get_nested_model_by_id(
            db=db,
            parent_model=User,
            parent_id=owner_id,
            dependent_model=model,
            dependent_id=model_id,
            parent_fk_name=user_fk,
        )
    except DependentModelOwnershipError:
        raise UserOwnershipError(model_type=model, model_id=model_id, user_id=owner_id) from None
