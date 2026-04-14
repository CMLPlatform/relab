"""Parent/ownership scoped CRUD query helpers."""

from typing import Any, cast

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import CRUDConfigurationError, DependentModelOwnershipError
from app.api.common.crud.loading import LoaderProfile
from app.api.common.crud.query import QueryOptions, list_models, require_model
from app.api.common.models.base import get_model_label
from app.api.common.models.custom_types import DT, IDT, MT


async def require_scoped_model(
    db: AsyncSession,
    parent_model: type[MT],
    parent_id: IDT,
    dependent_model: type[DT],
    dependent_id: IDT,
    parent_fk_name: str,
    *,
    loaders: LoaderProfile | frozenset[str] | set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> DT:
    """Return a child model only when it belongs to the requested parent."""
    if not hasattr(dependent_model, parent_fk_name):
        dependent_model_name = get_model_label(dependent_model)
        err_msg = f"{dependent_model_name} does not have a {parent_fk_name} field"
        raise CRUDConfigurationError(err_msg)

    await require_model(db, parent_model, parent_id)
    dependent_model_any = cast("Any", dependent_model)
    statement = select(dependent_model).where(
        dependent_model_any.id == dependent_id,
        getattr(dependent_model, parent_fk_name) == parent_id,
    )
    matches = await list_models(
        db,
        dependent_model,
        QueryOptions(loaders=loaders, statement=statement, read_schema=read_schema),
    )
    if not matches:
        dependent_exists = await require_model(
            db,
            dependent_model,
            dependent_id,
            loaders=loaders,
            read_schema=read_schema,
        )
        if getattr(dependent_exists, parent_fk_name) != parent_id:
            raise DependentModelOwnershipError(
                dependent_model=dependent_model,
                dependent_id=dependent_id,
                parent_model=parent_model,
                parent_id=parent_id,
            )
    return matches[0]
