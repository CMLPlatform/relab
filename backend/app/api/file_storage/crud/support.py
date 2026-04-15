"""Shared helpers and services for file-backed media CRUD."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from anyio import Path as AnyIOPath
from anyio import to_thread
from fastapi import UploadFile
from pydantic import UUID4
from slugify import slugify
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.persistence import SupportsModelDump, update_and_commit
from app.api.common.crud.query import require_model
from app.api.file_storage.exceptions import (
    FastAPIStorageFileNotFoundError,
    ModelFileNotFoundError,
    UploadTooLargeError,
)
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.api.file_storage.parents import parent_model_for_type
from app.api.file_storage.schemas import (
    MAX_FILE_SIZE_MB,
    MAX_IMAGE_SIZE_MB,
    FileCreate,
    ImageCreateFromForm,
    ImageCreateInternal,
)
from app.core.images import delete_thumbnails, generate_thumbnails, process_image_for_storage

if TYPE_CHECKING:
    from typing import BinaryIO


logger = logging.getLogger(__name__)

StorageModel = File | Image
StorageCreateSchema = FileCreate | ImageCreateFromForm | ImageCreateInternal


def stored_file_path(item: File | Image) -> Path | None:
    """Return the storage path for a stored file-backed model."""
    file_field = getattr(item, "file", None)
    path = getattr(file_field, "path", None)
    return Path(path) if path else None


def storage_item_exists(item: File | Image) -> bool:
    """Return whether the backing file exists on disk."""
    file_path = stored_file_path(item)
    return file_path is not None and file_path.exists()


def sanitize_filename(filename: str, max_length: int = 42) -> str:
    """Preserve all suffixes while sanitizing the base name."""
    path = Path(filename)
    name = path.name

    for suffix in path.suffixes[::-1]:
        name = name.removesuffix(suffix)

    sanitized_filename = slugify(
        name[:-1] + "_" if len(name) > max_length else name,
        lowercase=False,
        max_length=max_length,
        word_boundary=True,
    )

    return f"{sanitized_filename}{''.join(path.suffixes)}"


def process_uploadfile_name(file: UploadFile) -> tuple[UploadFile, UUID4, str]:
    """Process an UploadFile for storing in the database."""
    if file.filename is None:
        msg = "File name is empty."
        raise ValueError(msg)

    original_filename = sanitize_filename(file.filename)
    file_id = uuid.uuid4()
    file.filename = f"{file_id.hex}_{original_filename}"
    return file, file_id, original_filename


async def delete_file_from_storage(file_path: Path) -> None:
    """Delete a file from the filesystem."""
    async_path = AnyIOPath(str(file_path))
    if await async_path.exists():
        await async_path.unlink()


async def delete_image_from_storage(image_path: Path) -> None:
    """Delete an image and any generated thumbnails from the filesystem."""
    await to_thread.run_sync(delete_thumbnails, image_path)
    await delete_file_from_storage(image_path)


async def _ensure_parent_exists(db: AsyncSession, parent_type: MediaParentType, parent_id: int) -> None:
    """Validate that the target parent record exists."""
    parent_model = parent_model_for_type(parent_type)
    await require_model(db, parent_model, parent_id)


def _measure_file_size(file: BinaryIO) -> int:
    """Measure a binary file object without changing its current position."""
    current_position = file.tell()
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(current_position)
    return file_size


async def _validate_upload_size(upload_file: UploadFile, max_size_mb: int) -> None:
    """Validate upload size, even when UploadFile.size is unavailable."""
    file_size = upload_file.size
    if file_size is None:
        file_size = await to_thread.run_sync(_measure_file_size, upload_file.file)

    if file_size == 0:
        msg = "File size is zero."
        raise ValueError(msg)
    if file_size > max_size_mb * 1024 * 1024:
        raise UploadTooLargeError(file_size_bytes=file_size, max_size_mb=max_size_mb)


def _build_storage_instance[StorageModelT: StorageModel](
    *,
    model: type[StorageModelT],
    file_id: UUID4,
    original_filename: str,
    stored_name: str,
    payload: StorageCreateSchema,
) -> StorageModelT:
    """Create a storage model instance from an upload payload."""
    item_kwargs: dict[str, Any] = {
        "id": file_id,
        "description": payload.description,
        "filename": original_filename,
        "file": stored_name,
        "parent_type": payload.parent_type,
        "parent_id": payload.parent_id,
    }
    if isinstance(payload, ImageCreateFromForm | ImageCreateInternal):
        item_kwargs["image_metadata"] = payload.image_metadata

    return model(**item_kwargs)


async def _process_created_image(db: AsyncSession, db_image: Image) -> Image:
    """Post-process a stored image and roll back the record on processing failures."""
    image_path = stored_file_path(db_image)
    if image_path is None:
        return db_image

    try:
        await to_thread.run_sync(process_image_for_storage, image_path)
    except (ValueError, OSError) as e:
        logger.warning("Image processing failed for image %s, rolling back: %s", db_image.id, e)
        await delete_image_record(db, db_image.id)
        raise ValueError(str(e)) from e

    try:
        await to_thread.run_sync(generate_thumbnails, image_path)
    except (ValueError, OSError):
        logger.warning("Thumbnail generation failed for image %s, skipping", db_image.id, exc_info=True)

    return db_image


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


class StoredMediaService[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema]:
    """Explicit service for create/delete operations on stored media."""

    def __init__(
        self,
        *,
        model: type[StorageModelT],
        max_size_mb: int,
    ) -> None:
        self.model = model
        self.max_size_mb = max_size_mb

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an uploaded file to storage."""
        msg = "Subclasses must implement write_upload()."
        raise NotImplementedError(msg)

    async def after_create(self, db: AsyncSession, item: StorageModelT) -> StorageModelT:
        """Hook for post-create processing."""
        del db
        return item

    async def create(self, db: AsyncSession, payload: CreateSchemaT) -> StorageModelT:
        """Create a file-backed model, store the upload, and persist the DB row."""
        if payload.file.filename is None:
            msg = "File name is empty"
            raise ValueError(msg)

        await _validate_upload_size(payload.file, self.max_size_mb)
        payload.file, file_id, original_filename = process_uploadfile_name(payload.file)
        await _ensure_parent_exists(db, payload.parent_type, payload.parent_id)

        stored_name = await self.write_upload(payload.file, cast("str", payload.file.filename))
        db_item = _build_storage_instance(
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
        try:
            db_item = await require_model(db, self.model, item_id)
            file_path = stored_file_path(db_item)
            cleanup_path = file_path
        except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
            db_item = await db.get(self.model, item_id)
            file_path = None
            if db_item is not None and self.model is Image:
                cleanup_path = stored_file_path(db_item)
            logger.warning(
                "%s %s not found in storage: %s. Deleting database row only.",
                self.model.__name__,
                item_id,
                e,
            )

        if db_item is None:
            raise ModelNotFoundError(self.model, item_id)

        await db.delete(db_item)
        await db.commit()

        if self.model is Image and cleanup_path:
            await delete_image_from_storage(cleanup_path)
        elif file_path:
            await delete_file_from_storage(file_path)


class FileStorageService(StoredMediaService[File, FileCreate]):
    """Service for generic file storage."""

    def __init__(self) -> None:
        super().__init__(model=File, max_size_mb=MAX_FILE_SIZE_MB)

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist a generic file upload."""
        return await _get_file_storage().write_upload(upload_file, filename)


class ImageStorageService(StoredMediaService[Image, ImageCreateFromForm | ImageCreateInternal]):
    """Service for image storage and post-processing."""

    def __init__(self) -> None:
        super().__init__(model=Image, max_size_mb=MAX_IMAGE_SIZE_MB)

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an image upload."""
        return await _get_image_storage().write_image_upload(upload_file, filename)

    async def after_create(self, db: AsyncSession, item: Image) -> Image:
        """Process the saved image after it has been persisted."""
        return await _process_created_image(db, item)


file_storage_service = FileStorageService()
image_storage_service = ImageStorageService()


async def delete_image_record(db: AsyncSession, image_id: UUID4) -> None:
    """Delete an image row and remove it from storage."""
    await image_storage_service.delete(db, image_id)
