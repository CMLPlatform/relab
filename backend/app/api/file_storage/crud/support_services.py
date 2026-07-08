"""Service classes and query helpers for file-backed media CRUD."""

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from anyio import to_thread
from fastapi import UploadFile
from pydantic import UUID4
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.query import require_locked_model, require_model
from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import Base
from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError, ModelFileNotFoundError
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.api.file_storage.parents import parent_model_for_type
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm, ImageCreateInternal
from app.api.file_storage.upload_policy import (
    validate_generic_file_upload_content,
    validate_generic_file_upload_metadata,
    validate_image_upload_content,
    validate_image_upload_metadata,
)
from app.api.file_storage.upload_quota import release_product_upload_quota_for_media, reserve_product_upload_quota
from app.api.file_storage.upload_security import scan_upload_or_raise
from app.core.config import settings
from app.core.images import generate_thumbnails, process_image_for_storage

from .support_paths import delete_file_from_storage, delete_image_from_storage, stored_file_path
from .support_types import StorageCreateSchema, StorageModel
from .support_uploads import build_storage_instance, process_uploadfile_name, validate_upload_size

if TYPE_CHECKING:
    from pathlib import Path
    from uuid import UUID

    from app.api.common.crud.filtering import BaseFilterSet

logger = logging.getLogger(__name__)


async def ensure_parent_exists(db: AsyncSession, parent_type: MediaParentType, parent_id: int) -> None:
    """Validate that the target parent record exists."""
    parent_model = parent_model_for_type(parent_type)
    await require_model(db, parent_model, parent_id)


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


def parent_media_select[StorageModelT: StorageModel](
    model: type[StorageModelT],
    *,
    parent_type: MediaParentType,
    parent_id: int,
    filter_params: BaseFilterSet | None = None,
) -> Select[tuple[StorageModelT]]:
    """Build the filtered (unpaginated) select for one parent/type scope."""
    statement: Select[tuple[StorageModelT]] = select(model).where(
        model.parent_type == parent_type,
        model.parent_id == parent_id,
    )
    return apply_filter(statement, model, filter_params)


async def list_parent_storage_items[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    model: type[StorageModelT],
    parent_type: MediaParentType,
    parent_id: int,
    filter_params: BaseFilterSet | None = None,
    limit: int | None = None,
) -> list[StorageModelT]:
    """List storage items owned by one parent/type scope."""
    statement = parent_media_select(model, parent_type=parent_type, parent_id=parent_id, filter_params=filter_params)
    if limit is not None:
        statement = statement.limit(limit)
    return list((await db.execute(statement)).scalars().all())


async def _process_created_image(db: AsyncSession, db_image: Image) -> Image:
    """Post-process a stored image and roll back the record on processing failures."""
    image_path = stored_file_path(db_image)
    if image_path is None:
        return db_image

    try:
        await require_model(db, Image, db_image.id)
        await to_thread.run_sync(process_image_for_storage, image_path)
    except (ValueError, OSError) as e:
        logger.warning("Image processing failed for image %s, rolling back: %s", db_image.id, e)
        await delete_image_record(db, db_image.id)
        raise BadRequestError(str(e)) from e

    try:
        await to_thread.run_sync(generate_thumbnails, image_path)
    except ValueError, OSError:
        logger.warning("Thumbnail generation failed for image %s, skipping", db_image.id, exc_info=True)

    return db_image


class StoredMediaService[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema](ABC):
    """Explicit service for create/delete operations on stored media."""

    def __init__(
        self,
        *,
        model: type[StorageModelT],
    ) -> None:
        self.model = model

    @property
    @abstractmethod
    def max_size_mb(self) -> int:
        """Return the upload size limit for this media type."""

    @abstractmethod
    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an uploaded file to storage."""

    async def after_create(self, db: AsyncSession, item: StorageModelT) -> StorageModelT:
        """Hook for post-create processing."""
        del db
        return item

    def validate_upload_metadata(self, upload_file: UploadFile) -> None:
        """Validate upload metadata before storing bytes."""
        del upload_file

    def validate_upload_content(self, upload_file: UploadFile) -> None:
        """Validate upload content before storing bytes."""
        del upload_file

    async def create(
        self,
        db: AsyncSession,
        payload: CreateSchemaT,
        *,
        quota_user_id: UUID | None = None,
    ) -> StorageModelT:
        """Create a file-backed model, store the upload, and persist the DB row."""
        if payload.file.filename is None:
            msg = "File name is empty"
            raise BadRequestError(msg)

        self.validate_upload_metadata(payload.file)
        upload_size_bytes = await validate_upload_size(payload.file, self.max_size_mb)
        await to_thread.run_sync(self.validate_upload_content, payload.file)
        await scan_upload_or_raise(payload.file)
        payload.file, file_id, original_filename, stored_filename = process_uploadfile_name(payload.file)
        await ensure_parent_exists(db, payload.parent_type, payload.parent_id)
        if quota_user_id is not None:
            # quota_user_id gates whether this upload counts against quota (product
            # media only); the charge itself always targets the parent's owner.
            await reserve_product_upload_quota(db, parent_id=payload.parent_id, upload_size_bytes=upload_size_bytes)

        stored_name = await self.write_upload(payload.file, stored_filename)
        db_item = build_storage_instance(
            model=self.model,
            file_id=file_id,
            upload_size_bytes=upload_size_bytes,
            original_filename=original_filename,
            stored_name=stored_name,
            payload=payload,
        )

        db.add(db_item)
        await db.commit()
        await db.refresh(db_item)
        return await self.after_create(db, db_item)

    async def delete(self, db: AsyncSession, item_id: UUID4) -> None:
        """Delete a file-backed model and best-effort clean up its storage file."""
        cleanup_path: Path | None = None
        file_path: Path | None = None
        try:
            db_item = await require_locked_model(db, self.model, item_id)
            file_path = stored_file_path(db_item)
            cleanup_path = file_path
        except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
            maybe_item = await get_optional_storage_item(db, self.model, item_id)
            db_item = ensure_storage_item_found(self.model, item_id, maybe_item)
            if self.model is Image:
                cleanup_path = stored_file_path(db_item)
            logger.warning(
                "%s %s not found in storage: %s. Deleting database row only.",
                self.model.__name__,
                item_id,
                e,
            )

        await db.delete(db_item)
        await release_product_upload_quota_for_media(db, db_item)
        await db.commit()

        if self.model is Image and cleanup_path:
            await delete_image_from_storage(cleanup_path)
        elif file_path:
            await delete_file_from_storage(file_path)


class FileStorageService(StoredMediaService[File, FileCreate]):
    """Service for generic file storage."""

    def __init__(self) -> None:
        super().__init__(model=File)

    @property
    def max_size_mb(self) -> int:
        """Return the configured generic file upload limit."""
        return settings.max_file_upload_size_mb

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist a generic file upload."""
        return await _get_file_storage().write_upload(upload_file, filename)

    def validate_upload_metadata(self, upload_file: UploadFile) -> None:
        """Validate generic file upload metadata."""
        validate_generic_file_upload_metadata(upload_file)

    def validate_upload_content(self, upload_file: UploadFile) -> None:
        """Validate generic file upload content."""
        validate_generic_file_upload_content(upload_file)


class ImageStorageService(StoredMediaService[Image, ImageCreateFromForm | ImageCreateInternal]):
    """Service for image storage and post-processing."""

    def __init__(self) -> None:
        super().__init__(model=Image)

    @property
    def max_size_mb(self) -> int:
        """Return the configured image upload limit."""
        return settings.max_image_upload_size_mb

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an image upload."""
        return await _get_image_storage().write_upload(upload_file, filename)

    def validate_upload_metadata(self, upload_file: UploadFile) -> None:
        """Validate image upload metadata."""
        validate_image_upload_metadata(upload_file)

    def validate_upload_content(self, upload_file: UploadFile) -> None:
        """Validate image upload content."""
        validate_image_upload_content(upload_file)

    async def after_create(self, db: AsyncSession, item: Image) -> Image:
        """Process the saved image after it has been persisted."""
        return await _process_created_image(db, item)


file_storage_service = FileStorageService()
image_storage_service = ImageStorageService()


async def delete_image_record(db: AsyncSession, image_id: UUID4) -> None:
    """Delete an image row and remove it from storage."""
    await image_storage_service.delete(db, image_id)
