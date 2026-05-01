"""Query/update helpers for stored media rows."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.persistence import SupportsModelDump, update_and_commit
from app.api.common.crud.query import require_model
from app.api.common.models.base import Base
from app.api.file_storage.exceptions import (
    FastAPIStorageFileNotFoundError,
    ModelFileNotFoundError,
)
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.parents import parent_model_for_type

from .support_types import StorageModel

if TYPE_CHECKING:
    from app.api.common.crud.filtering import BaseFilterSet


async def ensure_parent_exists(db: AsyncSession, parent_type: MediaParentType, parent_id: int) -> None:
    """Validate that the target parent record exists."""
    parent_model = parent_model_for_type(parent_type)
    await require_model(db, parent_model, parent_id)


async def get_storage_item_or_raise[StorageModelT: StorageModel](
    db: AsyncSession,
    model: type[StorageModelT],
    item_id: UUID4,
) -> StorageModelT:
    """Fetch a storage item and normalize storage-related lookup errors."""
    try:
        return await require_model(db, model, item_id)
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
        raise ModelFileNotFoundError(model, item_id, details=str(e)) from e


async def update_storage_item[StorageModelT: StorageModel, UpdateSchemaT: SupportsModelDump](
    db: AsyncSession,
    model: type[StorageModelT],
    item_id: UUID4,
    update_payload: UpdateSchemaT,
) -> StorageModelT:
    """Update a storage item after resolving storage-specific lookup failures."""
    db_item = await get_storage_item_or_raise(db, model, item_id)
    return await update_and_commit(db, db_item, update_payload)


async def get_optional_storage_item[StorageModelT: StorageModel](
    db: AsyncSession,
    model: type[StorageModelT],
    item_id: UUID4,
) -> StorageModelT | None:
    """Return a storage item directly from SQLAlchemy or None when missing."""
    return await db.get(model, item_id)


def ensure_storage_item_found[StorageModelT: StorageModel](
    model: type[StorageModelT],
    item_id: UUID4,
    db_item: StorageModelT | None,
) -> StorageModelT:
    """Raise the standard not-found error when a storage item is missing."""
    if db_item is None:
        raise ModelNotFoundError(model, item_id)
    return db_item


async def get_parent_owned_storage_item[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    parent_model: type[Base],
    model: type[StorageModelT],
    parent_id: int,
    item_id: UUID4,
    parent_type: MediaParentType,
) -> StorageModelT:
    """Fetch a storage item and verify that it belongs to the scoped parent."""
    await require_model(db, parent_model, parent_id)
    try:
        statement = select(model).where(
            model.id == item_id,
            model.parent_id == parent_id,
            model.parent_type == parent_type,
        )
        db_item = (await db.execute(statement)).scalars().unique().one_or_none()
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
        raise ModelFileNotFoundError(model, item_id, details=str(e)) from e

    return ensure_storage_item_found(model, item_id, db_item)


async def list_parent_storage_items[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    model: type[StorageModelT],
    parent_type: MediaParentType,
    parent_id: int,
    filter_params: BaseFilterSet | None = None,
) -> list[StorageModelT]:
    """List storage items owned by one parent/type scope."""
    statement: Select[tuple[StorageModelT]] = select(model).where(
        model.parent_type == parent_type,
        model.parent_id == parent_id,
    )
    statement = apply_filter(statement, model, filter_params)
    return list((await db.execute(statement)).scalars().all())
