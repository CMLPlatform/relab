"""Parent-scoped CRUD operations for stored media."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.models.custom_types import MT
from app.api.file_storage.exceptions import (
    FastAPIStorageFileNotFoundError,
)
from app.api.file_storage.models import MediaParentType
from app.core.logging import sanitize_log_value

from .support_paths import storage_item_exists
from .support_queries import get_parent_owned_storage_item, list_parent_storage_items
from .support_types import StorageCreateSchema, StorageModel

if TYPE_CHECKING:
    from fastapi_filter.contrib.sqlalchemy import Filter

    from .support_services import StoredMediaService


logger = logging.getLogger(__name__)


class ParentMediaCrud[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema]:
    """Parent-scoped operations for stored media."""

    def __init__(
        self,
        *,
        parent_model: type[object],
        parent_type: MediaParentType,
        storage_model: type[StorageModelT],
        storage_service: StoredMediaService[StorageModelT, CreateSchemaT],
    ) -> None:
        self.parent_model = parent_model
        self.storage_model = storage_model
        self.parent_type = parent_type
        self.storage_service = storage_service

    def _validate_parent_scope(self, parent_id: int, item_data: CreateSchemaT) -> None:
        """Ensure the payload is already scoped to this parent."""
        if item_data.parent_id != parent_id:
            msg = f"Parent ID mismatch: expected {parent_id}, got {item_data.parent_id}"
            raise ValueError(msg)
        if item_data.parent_type != self.parent_type:
            msg = f"Parent type mismatch: expected {self.parent_type}, got {item_data.parent_type}"
            raise ValueError(msg)

    async def get_all(
        self,
        db: AsyncSession,
        parent_id: int,
        *,
        filter_params: Filter | None = None,
    ) -> list[StorageModelT]:
        """Get all storage items for a parent, excluding items with missing files."""
        items = await list_parent_storage_items(
            db,
            model=self.storage_model,
            parent_type=self.parent_type,
            parent_id=parent_id,
            filter_params=filter_params,
        )
        valid_items = [item for item in items if storage_item_exists(item)]
        if len(valid_items) < len(items):
            missing = len(items) - len(valid_items)
            logger.warning(
                "%d %s(s) for %s %s have missing files in storage and will be excluded from the response.",
                missing,
                sanitize_log_value(self.storage_model.__name__),
                sanitize_log_value(self.parent_model.__name__),
                sanitize_log_value(parent_id),
            )
        return valid_items

    async def get_by_id(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> StorageModelT:
        """Get a specific storage item for a parent, raising an error if the file is missing."""
        db_item = await get_parent_owned_storage_item(
            db,
            parent_model=cast("type[MT]", self.parent_model),
            model=self.storage_model,
            parent_id=parent_id,
            item_id=item_id,
        )

        if not storage_item_exists(db_item):
            raise FastAPIStorageFileNotFoundError(filename=getattr(db_item, "filename", str(item_id)))

        return db_item

    async def create(self, db: AsyncSession, parent_id: int, item_data: CreateSchemaT) -> StorageModelT:
        """Create a new storage item for a parent."""
        self._validate_parent_scope(parent_id, item_data)
        return await self.storage_service.create(db, item_data)

    async def delete(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> None:
        """Delete a storage item from a parent."""
        await get_parent_owned_storage_item(
            db,
            parent_model=cast("type[MT]", self.parent_model),
            model=self.storage_model,
            parent_id=parent_id,
            item_id=item_id,
        )
        await self.storage_service.delete(db, item_id)

    async def delete_all(self, db: AsyncSession, parent_id: int) -> None:
        """Delete all storage items associated with a parent."""
        items = await self.get_all(db, parent_id)
        for item in items:
            if item.id is not None:
                await self.storage_service.delete(db, item.id)
