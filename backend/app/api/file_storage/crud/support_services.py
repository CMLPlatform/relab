"""Service classes for file-backed media CRUD."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from anyio import to_thread
from fastapi import UploadFile
from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.query import require_model
from app.api.common.exceptions import BadRequestError
from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError, ModelFileNotFoundError
from app.api.file_storage.models import File, Image
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm, ImageCreateInternal
from app.api.file_storage.upload_policy import (
    validate_generic_file_upload_content,
    validate_generic_file_upload_metadata,
    validate_image_upload_content,
    validate_image_upload_metadata,
)
from app.core.config import settings
from app.core.images import generate_thumbnails, process_image_for_storage

from .support_paths import delete_file_from_storage, delete_image_from_storage, stored_file_path
from .support_queries import ensure_parent_exists, ensure_storage_item_found, get_optional_storage_item
from .support_types import StorageCreateSchema, StorageModel
from .support_uploads import build_storage_instance, process_uploadfile_name, validate_upload_size

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)


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


class StoredMediaService[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema]:
    """Explicit service for create/delete operations on stored media."""

    def __init__(
        self,
        *,
        model: type[StorageModelT],
    ) -> None:
        self.model = model

    @property
    def max_size_mb(self) -> int:
        """Return the upload size limit for this media type."""
        msg = "Subclasses must define max_size_mb."
        raise NotImplementedError(msg)

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an uploaded file to storage."""
        msg = "Subclasses must implement write_upload()."
        raise NotImplementedError(msg)

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

    async def create(self, db: AsyncSession, payload: CreateSchemaT) -> StorageModelT:
        """Create a file-backed model, store the upload, and persist the DB row."""
        if payload.file.filename is None:
            msg = "File name is empty"
            raise BadRequestError(msg)

        self.validate_upload_metadata(payload.file)
        await validate_upload_size(payload.file, self.max_size_mb)
        await to_thread.run_sync(self.validate_upload_content, payload.file)
        payload.file, file_id, original_filename, stored_filename = process_uploadfile_name(payload.file)
        await ensure_parent_exists(db, payload.parent_type, payload.parent_id)

        stored_name = await self.write_upload(payload.file, stored_filename)
        db_item = build_storage_instance(
            model=self.model,
            file_id=file_id,
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
            db_item = await require_model(db, self.model, item_id, for_update=True)
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
        return await _get_image_storage().write_image_upload(upload_file, filename)

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
