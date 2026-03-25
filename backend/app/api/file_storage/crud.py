"""CRUD operations for file storage models."""

import logging
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, TypeVar, cast, overload

from anyio import Path as AnyIOPath
from anyio import to_thread
from fastapi import UploadFile
from fastapi_filter.contrib.sqlalchemy import Filter
from pydantic import UUID4
from slugify import slugify
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.expression import SelectOfScalar

from app.api.common.crud.base import get_models
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.persistence import SupportsModelDump, update_and_commit
from app.api.common.crud.utils import get_file_parent_type_model, get_model_or_404
from app.api.common.models.custom_types import MT
from app.api.file_storage.exceptions import (
    FastAPIStorageFileNotFoundError,
    ModelFileNotFoundError,
    ParentStorageOwnershipError,
    UploadTooLargeError,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image, MediaParentType
from app.api.file_storage.models.storage import get_storage
from app.api.file_storage.presentation import storage_item_exists, stored_file_path
from app.api.file_storage.schemas import (
    MAX_FILE_SIZE_MB,
    MAX_IMAGE_SIZE_MB,
    FileCreate,
    FileUpdate,
    ImageCreateFromForm,
    ImageCreateInternal,
    ImageUpdate,
)
from app.core.config import settings
from app.core.images import process_image_for_storage

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import BinaryIO

logger = logging.getLogger(__name__)

StorageModel = File | Image
StorageCreateSchema = FileCreate | ImageCreateFromForm | ImageCreateInternal


### Common utilities ###
def sanitize_filename(filename: str, max_length: int = 42) -> str:
    """Preserve all suffixes while sanitizing base name."""
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
        err_msg = "File name is empty."
        raise ValueError(err_msg)

    original_filename = sanitize_filename(file.filename)
    file_id = uuid.uuid4()
    file.filename = f"{file_id.hex}_{original_filename}"
    return file, file_id, original_filename


async def delete_file_from_storage(file_path: Path) -> None:
    """Delete a file from the filesystem."""
    async_path = AnyIOPath(str(file_path))
    if await async_path.exists():
        await async_path.unlink()


async def _ensure_parent_exists(db: AsyncSession, parent_type: MediaParentType, parent_id: int) -> None:
    """Validate that the target parent record exists."""
    parent_model = get_file_parent_type_model(parent_type)
    await get_model_or_404(db, parent_model, parent_id)


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
        err_msg = "File size is zero."
        raise ValueError(err_msg)
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
    }
    if isinstance(payload, ImageCreateFromForm | ImageCreateInternal):
        item_kwargs["image_metadata"] = payload.image_metadata

    db_item = model(**item_kwargs)
    db_item.set_parent(payload.parent_type, payload.parent_id)
    return db_item


async def _process_created_image(db: AsyncSession, db_image: Image) -> Image:
    """Post-process a stored image and roll back the record on processing failures."""
    image_path = stored_file_path(db_image)
    if image_path is None:
        return db_image

    try:
        await to_thread.run_sync(process_image_for_storage, image_path)
    except (ValueError, OSError) as e:
        logger.warning("Image processing failed for image %s, rolling back: %s", db_image.db_id, e)
        await delete_image(db, db_image.db_id)
        raise ValueError(str(e)) from e

    return db_image


async def _get_storage_item_or_raise[StorageModelT: StorageModel](
    db: AsyncSession,
    model: type[StorageModelT],
    item_id: UUID4,
) -> StorageModelT:
    """Fetch a storage item and normalize storage-related lookup errors."""
    try:
        return await get_model_or_404(db, model, item_id)
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
        raise ModelFileNotFoundError(model, item_id, details=str(e)) from e


async def _update_storage_item[StorageModelT: StorageModel, UpdateSchemaT: SupportsModelDump](
    db: AsyncSession,
    model: type[StorageModelT],
    item_id: UUID4,
    update_payload: UpdateSchemaT,
) -> StorageModelT:
    """Update a storage item after resolving storage-specific lookup failures."""
    db_item = await _get_storage_item_or_raise(db, model, item_id)
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
            err_msg = "File name is empty"
            raise ValueError(err_msg)

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
        try:
            db_item = await get_model_or_404(db, self.model, item_id)
            file_path = stored_file_path(db_item)
        except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
            db_item = await db.get(self.model, item_id)
            file_path = None
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

        if file_path:
            await delete_file_from_storage(file_path)


class FileStorageService(StoredMediaService[File, FileCreate]):
    """Service for generic file storage."""

    def __init__(self) -> None:
        super().__init__(model=File, max_size_mb=MAX_FILE_SIZE_MB)

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist a generic file upload."""
        return await get_storage(settings.file_storage_path).write_upload(upload_file, filename)


class ImageStorageService(StoredMediaService[Image, ImageCreateFromForm | ImageCreateInternal]):
    """Service for image storage and post-processing."""

    def __init__(self) -> None:
        super().__init__(model=Image, max_size_mb=MAX_IMAGE_SIZE_MB)

    async def write_upload(self, upload_file: UploadFile, filename: str) -> str:
        """Persist an image upload."""
        return await get_storage(settings.image_storage_path).write_image_upload(upload_file, filename)

    async def after_create(self, db: AsyncSession, item: Image) -> Image:
        """Process the saved image after it has been persisted."""
        return await _process_created_image(db, item)


file_storage_service = FileStorageService()
image_storage_service = ImageStorageService()


### File CRUD operations ###
async def get_files(db: AsyncSession, *, file_filter: FileFilter | None = None) -> Sequence[File]:
    """Get all files from the database."""
    return await get_models(db, File, model_filter=file_filter)


async def get_file(db: AsyncSession, file_id: UUID4) -> File:
    """Get a file from the database."""
    return await _get_storage_item_or_raise(db, File, file_id)


async def create_file(db: AsyncSession, file_data: FileCreate) -> File:
    """Create a new file in the database and save it."""
    return await file_storage_service.create(db, file_data)


async def update_file(db: AsyncSession, file_id: UUID4, file: FileUpdate) -> File:
    """Update an existing file in the database."""
    return await _update_storage_item(db, File, file_id, file)


async def delete_file(db: AsyncSession, file_id: UUID4) -> None:
    """Delete a file from the database and remove it from storage."""
    await file_storage_service.delete(db, file_id)


### Image CRUD operations ###
async def get_images(db: AsyncSession, *, image_filter: ImageFilter | None = None) -> Sequence[Image]:
    """Get all images from the database."""
    return await get_models(db, Image, model_filter=image_filter)


async def get_image(db: AsyncSession, image_id: UUID4) -> Image:
    """Get an image from the database."""
    return await _get_storage_item_or_raise(db, Image, image_id)


async def create_image(db: AsyncSession, image_data: ImageCreateFromForm | ImageCreateInternal) -> Image:
    """Create a new image in the database and save it."""
    return await image_storage_service.create(db, image_data)


async def update_image(db: AsyncSession, image_id: UUID4, image: ImageUpdate) -> Image:
    """Update an existing image in the database."""
    return await _update_storage_item(db, Image, image_id, image)


async def delete_image(db: AsyncSession, image_id: UUID4) -> None:
    """Delete an image from the database and remove it from storage."""
    await image_storage_service.delete(db, image_id)


### Parent CRUD operations ###
P = TypeVar("P")
S = TypeVar("S", File, Image)
C = TypeVar("C", FileCreate, ImageCreateFromForm)
F = TypeVar("F", bound=Filter)
StorageServiceT = FileStorageService | ImageStorageService


class ParentStorageOperations[P, S, C, F]:
    """Parent-scoped operations for file-backed models."""

    def __init__(
        self,
        parent_model: type[MT],
        storage_model: type[File | Image],
        parent_type: MediaParentType,
        parent_field: str,
        storage_service: StorageServiceT,
    ) -> None:
        self.parent_model = parent_model
        self.storage_model = storage_model
        self.parent_type = parent_type
        self.parent_field = parent_field
        self.storage_service = storage_service

    async def _ensure_parent_exists(self, db: AsyncSession, parent_id: int) -> None:
        """Validate that the scoped parent record exists."""
        await get_model_or_404(db, self.parent_model, parent_id)

    def _validate_parent_scope(self, parent_id: int, item_data: C) -> None:
        """Ensure the payload is already scoped to this parent."""
        create_schema = cast("FileCreate | ImageCreateFromForm | ImageCreateInternal", item_data)
        if create_schema.parent_id != parent_id:
            err_msg = f"Parent ID mismatch: expected {parent_id}, got {create_schema.parent_id}"
            raise ValueError(err_msg)
        if create_schema.parent_type != self.parent_type:
            err_msg = f"Parent type mismatch: expected {self.parent_type}, got {create_schema.parent_type}"
            raise ValueError(err_msg)

    def _build_parent_statement(self) -> SelectOfScalar:
        """Build the base query for storage items owned by this parent type."""
        return select(self.storage_model).where(self.storage_model.parent_type == self.parent_type)

    async def _get_owned_item(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> File | Image:
        """Fetch a storage item and verify that it belongs to the scoped parent."""
        try:
            db_item = await db.get(self.storage_model, item_id)
        except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
            raise ModelFileNotFoundError(self.storage_model, item_id, details=str(e)) from e

        if not db_item:
            raise ModelNotFoundError(self.storage_model, item_id)

        if getattr(db_item, self.parent_field) != parent_id:
            raise ParentStorageOwnershipError(self.storage_model, item_id, self.parent_model, parent_id)

        return db_item

    async def get_all(
        self,
        db: AsyncSession,
        parent_id: int,
        *,
        filter_params: F | None = None,
    ) -> Sequence[File | Image]:
        """Get all storage items for a parent, excluding items with missing files."""
        await self._ensure_parent_exists(db, parent_id)

        statement = self._build_parent_statement().where(
            getattr(self.storage_model, self.parent_field) == parent_id,
        )

        if filter_params:
            statement = cast("Filter", filter_params).filter(statement)

        items = list((await db.exec(statement)).all())
        valid_items = [item for item in items if storage_item_exists(item)]
        if len(valid_items) < len(items):
            missing = len(items) - len(valid_items)
            logger.warning(
                "%d %s(s) for %s %s have missing files in storage and will be excluded from the response.",
                missing,
                self.storage_model.__name__,
                self.parent_model.__name__,
                parent_id,
            )
        return valid_items

    async def get_by_id(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> File | Image:
        """Get a specific storage item for a parent, raising an error if the file is missing."""
        await self._ensure_parent_exists(db, parent_id)
        db_item = await self._get_owned_item(db, parent_id, item_id)

        if not storage_item_exists(db_item):
            raise FastAPIStorageFileNotFoundError(filename=getattr(db_item, "filename", str(item_id)))

        return db_item

    @overload
    async def create(self, db: AsyncSession, parent_id: int, item_data: FileCreate) -> File: ...

    @overload
    async def create(self, db: AsyncSession, parent_id: int, item_data: ImageCreateFromForm) -> Image: ...

    async def create(self, db: AsyncSession, parent_id: int, item_data: C) -> File | Image:
        """Create a new storage item for a parent."""
        self._validate_parent_scope(parent_id, item_data)
        if isinstance(item_data, FileCreate):
            return await cast("FileStorageService", self.storage_service).create(db, item_data)
        return await cast("ImageStorageService", self.storage_service).create(
            db,
            cast("ImageCreateFromForm", item_data),
        )

    async def delete(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> None:
        """Delete a storage item from a parent."""
        await self._ensure_parent_exists(db, parent_id)
        await self._get_owned_item(db, parent_id, item_id)

        await self.storage_service.delete(db, item_id)

    async def delete_all(self, db: AsyncSession, parent_id: int) -> None:
        """Delete all storage items associated with a parent."""
        items = await self.get_all(db, parent_id)
        for item in items:
            if item.id is not None:
                await self.storage_service.delete(db, item.id)
