"""Parent-scoped CRUD operations for stored media."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import Base
from app.api.file_storage.exceptions import (
    FastAPIStorageFileNotFoundError,
)
from app.api.file_storage.models import Image, MediaParentType
from app.core.logging import sanitize_log_value

from .support_paths import delete_file_from_storage, delete_image_from_storage, storage_item_exists, stored_file_path
from .support_queries import get_parent_owned_storage_item, list_parent_storage_items
from .support_types import StorageCreateSchema, StorageModel

if TYPE_CHECKING:
    from uuid import UUID

    from app.api.common.crud.filtering import BaseFilterSet

    from .support_services import StoredMediaService


logger = logging.getLogger(__name__)


def validate_parent_media_scope[CreateSchemaT: StorageCreateSchema](
    *,
    parent_id: int,
    parent_type: MediaParentType,
    item_data: CreateSchemaT,
) -> None:
    """Ensure the payload is already scoped to this parent."""
    if item_data.parent_id != parent_id:
        msg = f"Parent ID mismatch: expected {parent_id}, got {item_data.parent_id}"
        raise BadRequestError(msg)
    if item_data.parent_type != parent_type:
        msg = f"Parent type mismatch: expected {parent_type}, got {item_data.parent_type}"
        raise BadRequestError(msg)


_SUB_RESOURCE_LIMIT = 200


async def list_parent_media[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    parent_model: type[Base],
    parent_type: MediaParentType,
    storage_model: type[StorageModelT],
    parent_id: int,
    filter_params: BaseFilterSet | None = None,
) -> list[StorageModelT]:
    """Get all storage items for a parent, excluding items with missing files."""
    items = await list_parent_storage_items(
        db,
        model=storage_model,
        parent_type=parent_type,
        parent_id=parent_id,
        filter_params=filter_params,
        limit=_SUB_RESOURCE_LIMIT,
    )
    valid_items = [item for item in items if storage_item_exists(item)]
    if len(valid_items) < len(items):
        missing = len(items) - len(valid_items)
        logger.warning(
            "%d %s(s) for %s %s have missing files in storage and will be excluded from the response.",
            missing,
            sanitize_log_value(storage_model.__name__),
            sanitize_log_value(parent_model.__name__),
            sanitize_log_value(parent_id),
        )
    return valid_items


async def get_parent_media[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    parent_model: type[Base],
    parent_type: MediaParentType,
    storage_model: type[StorageModelT],
    parent_id: int,
    item_id: UUID4,
) -> StorageModelT:
    """Get one storage item for a parent, raising when the file is missing."""
    db_item = await get_parent_owned_storage_item(
        db,
        parent_model=parent_model,
        model=storage_model,
        parent_id=parent_id,
        item_id=item_id,
        parent_type=parent_type,
    )

    if not storage_item_exists(db_item):
        raise FastAPIStorageFileNotFoundError(filename=getattr(db_item, "filename", str(item_id)))

    return db_item


async def create_parent_media[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema](
    db: AsyncSession,
    *,
    parent_id: int,
    parent_type: MediaParentType,
    storage_service: StoredMediaService[StorageModelT, CreateSchemaT],
    item_data: CreateSchemaT,
    quota_user_id: UUID | None = None,
) -> StorageModelT:
    """Create a new parent-scoped storage item."""
    validate_parent_media_scope(parent_id=parent_id, parent_type=parent_type, item_data=item_data)
    return await storage_service.create(db, item_data, quota_user_id=quota_user_id)


async def delete_parent_media[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema](
    db: AsyncSession,
    *,
    parent_model: type[Base],
    parent_type: MediaParentType,
    storage_model: type[StorageModelT],
    parent_id: int,
    item_id: UUID4,
    storage_service: StoredMediaService[StorageModelT, CreateSchemaT],
) -> None:
    """Delete one storage item from a parent."""
    await get_parent_owned_storage_item(
        db,
        parent_model=parent_model,
        model=storage_model,
        parent_id=parent_id,
        item_id=item_id,
        parent_type=parent_type,
    )
    await storage_service.delete(db, item_id)


async def delete_all_parent_media[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema](
    db: AsyncSession,
    *,
    parent_model: type[Base],
    parent_type: MediaParentType,
    storage_model: type[StorageModelT],
    parent_id: int,
    storage_service: StoredMediaService[StorageModelT, CreateSchemaT],
) -> None:
    """Delete all storage items associated with a parent in one bulk DB round-trip."""
    items = await list_parent_storage_items(
        db,
        model=storage_model,
        parent_type=parent_type,
        parent_id=parent_id,
    )
    if not items:
        return

    paths = [(item, stored_file_path(item)) for item in items if item.id is not None]
    ids = [item.id for item, _ in paths]
    await db.execute(delete(storage_model).where(storage_model.id.in_(ids)))
    await db.commit()

    for item, path in paths:
        if path is None:
            continue
        if isinstance(item, Image):
            await delete_image_from_storage(path)
        else:
            await delete_file_from_storage(path)


class ParentMediaCrud[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema]:
    """Parent-scoped operations for stored media."""

    def __init__(
        self,
        *,
        parent_model: type[Base],
        parent_type: MediaParentType,
        storage_model: type[StorageModelT],
        storage_service: StoredMediaService[StorageModelT, CreateSchemaT],
    ) -> None:
        self.parent_model = parent_model
        self.storage_model = storage_model
        self.parent_type = parent_type
        self.storage_service = storage_service

    async def get_all(
        self,
        db: AsyncSession,
        parent_id: int,
        *,
        filter_params: BaseFilterSet | None = None,
    ) -> list[StorageModelT]:
        """Get all storage items for a parent, excluding items with missing files."""
        return await list_parent_media(
            db,
            parent_model=self.parent_model,
            parent_type=self.parent_type,
            storage_model=self.storage_model,
            parent_id=parent_id,
            filter_params=filter_params,
        )

    async def get_by_id(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> StorageModelT:
        """Get a specific storage item for a parent, raising an error if the file is missing."""
        return await get_parent_media(
            db,
            parent_model=self.parent_model,
            parent_type=self.parent_type,
            storage_model=self.storage_model,
            parent_id=parent_id,
            item_id=item_id,
        )

    async def create(
        self,
        db: AsyncSession,
        parent_id: int,
        item_data: CreateSchemaT,
        *,
        quota_user_id: UUID | None = None,
    ) -> StorageModelT:
        """Create a new storage item for a parent."""
        return await create_parent_media(
            db,
            parent_id=parent_id,
            parent_type=self.parent_type,
            storage_service=self.storage_service,
            item_data=item_data,
            quota_user_id=quota_user_id,
        )

    async def delete(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> None:
        """Delete a storage item from a parent."""
        await delete_parent_media(
            db,
            parent_model=self.parent_model,
            parent_type=self.parent_type,
            storage_model=self.storage_model,
            parent_id=parent_id,
            item_id=item_id,
            storage_service=self.storage_service,
        )

    async def delete_all(self, db: AsyncSession, parent_id: int) -> None:
        """Delete all storage items associated with a parent."""
        await delete_all_parent_media(
            db,
            parent_model=self.parent_model,
            parent_type=self.parent_type,
            storage_model=self.storage_model,
            parent_id=parent_id,
            storage_service=self.storage_service,
        )
