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

from app.api.common.crud.base import get_models
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.utils import get_file_parent_type_model, get_model_or_404
from app.api.common.models.custom_types import MT
from app.api.data_collection.models import Product
from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError, ModelFileNotFoundError
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image, MediaParentType, Video
from app.api.file_storage.schemas import (
    FileCreate,
    FileUpdate,
    ImageCreateFromForm,
    ImageCreateInternal,
    ImageUpdate,
    VideoCreate,
    VideoCreateWithinProduct,
    VideoUpdate,
    VideoUpdateWithinProduct,
)
from app.core.images import process_image_for_storage

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

logger = logging.getLogger(__name__)


### Common utilities ###
def sanitize_filename(filename: str, max_length: int = 42) -> str:
    """Preserve all suffixes while sanitizing base name."""
    path = Path(filename)
    name = path.name

    # Reverse order to remove last suffix first
    for suffix in path.suffixes[::-1]:
        name = name.removesuffix(suffix)

    sanitized_filename = slugify(
        name[:-1] + "_" if len(name) > max_length else name, lowercase=False, max_length=max_length, word_boundary=True
    )

    return f"{sanitized_filename}{''.join(path.suffixes)}"


def process_uploadfile_name(
    file: UploadFile,
) -> tuple[UploadFile, UUID4, str]:
    """Process an UploadFile for storing in the database."""
    if file.filename is None:
        err_msg = "File name is empty."
        raise ValueError(err_msg)

    # Extract and truncate original filename
    original_filename: str = sanitize_filename(file.filename)

    file_id = uuid.uuid4()
    file.filename = f"{file_id.hex}_{original_filename}"
    return file, file_id, original_filename


async def delete_file_from_storage(file_path: Path) -> None:
    """Delete a file from the filesystem."""
    async_path = AnyIOPath(str(file_path))
    if await async_path.exists():
        await async_path.unlink()


### File CRUD operations ###
## Basic CRUD operations ##
async def get_files(db: AsyncSession, *, file_filter: FileFilter | None = None) -> Sequence[File]:
    """Get all files from the database."""
    # TODO: Handle missing files in storage
    return await get_models(db, File, model_filter=file_filter)


async def get_file(db: AsyncSession, file_id: UUID4) -> File:
    """Get a file from the database."""
    try:
        return await get_model_or_404(db, File, file_id)
    except FastAPIStorageFileNotFoundError as e:
        raise ModelFileNotFoundError(File, file_id, details=e.message) from e


async def create_file(db: AsyncSession, file_data: FileCreate) -> File:
    """Create a new file in the database and save it."""
    if file_data.file.filename is None:
        err_msg = "File name is empty"
        raise ValueError(err_msg)

    # Generate ID before creating File
    file_data.file, file_id, original_filename = process_uploadfile_name(file_data.file)

    # Verify parent exists (will raise ModelNotFoundError if not)
    parent_model = get_file_parent_type_model(file_data.parent_type)
    await get_model_or_404(db, parent_model, file_data.parent_id)

    db_file = File(
        id=file_id,
        description=file_data.description,
        filename=original_filename,
        file=file_data.file,
        parent_type=file_data.parent_type,
    )

    # Set parent id
    db_file.set_parent(file_data.parent_type, file_data.parent_id)

    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    return db_file


async def update_file(db: AsyncSession, file_id: UUID4, file: FileUpdate) -> File:
    """Update an existing file in the database."""
    try:
        db_file = await get_model_or_404(db, File, file_id)
    except FastAPIStorageFileNotFoundError as e:
        raise ModelFileNotFoundError(File, file_id, details=e.message) from e
    file_data: dict[str, Any] = file.model_dump(exclude_unset=True)
    db_file.sqlmodel_update(file_data)

    db.add(db_file)

    await db.commit()
    await db.refresh(db_file)

    return db_file


async def delete_file(db: AsyncSession, file_id: UUID4) -> None:
    """Delete a file from the database and remove it from storage."""
    try:
        db_file = await get_model_or_404(db, File, file_id)
        file_path = Path(db_file.file.path) if db_file.file else None
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
        # File missing from storage but exists in DB - proceed with DB cleanup
        # TODO: Test this scenario
        db_file = await db.get(File, file_id)
        file_path = None
        logger.warning("File %s not found in storage: %s. File instance will be deleted from the database.", file_id, e)

    await db.delete(db_file)
    await db.commit()

    if file_path:
        await delete_file_from_storage(file_path)


### Image CRUD operations ###
## Basic CRUD operations ##
async def get_images(db: AsyncSession, *, image_filter: ImageFilter | None = None) -> Sequence[Image]:
    """Get all images from the database."""
    # TODO: Handle missing files in storage
    return await get_models(db, Image, model_filter=image_filter)


async def get_image(db: AsyncSession, image_id: UUID4) -> Image:
    """Get an image from the database."""
    try:
        return await get_model_or_404(db, Image, image_id)
    except FastAPIStorageFileNotFoundError as e:
        raise ModelFileNotFoundError(Image, image_id, details=e.message) from e


async def create_image(db: AsyncSession, image_data: ImageCreateFromForm | ImageCreateInternal) -> Image:
    """Create a new image in the database and save it."""
    if image_data.file.filename is None:
        err_msg = "File name is empty"
        raise ValueError(err_msg)

    # Generate ID before creating File to store in local filesystem
    image_data.file, image_id, original_filename = process_uploadfile_name(image_data.file)

    # Verify parent exists via scalar ID lookup to avoid eager-loading relations.
    parent_model = get_file_parent_type_model(image_data.parent_type)
    parent_id_column = cast("Any", parent_model.id)
    parent_exists = (await db.exec(select(parent_id_column).where(parent_id_column == image_data.parent_id))).first()
    if parent_exists is None:
        raise ModelNotFoundError(parent_model, image_data.parent_id)

    db_image = Image(
        id=image_id,
        description=image_data.description,
        image_metadata=image_data.image_metadata,
        filename=original_filename,
        file=image_data.file,
        parent_type=image_data.parent_type,
    )

    # Set parent id
    db_image.set_parent(image_data.parent_type, image_data.parent_id)

    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)

    # Process the saved image in a thread: validate dimensions, apply EXIF orientation,
    # and strip sensitive metadata. On failure, clean up the DB record and file.
    # The `file` relationship may be a storage object with a `path` attribute.
    # Guard against mocks or incomplete objects by using getattr.
    image_path_attr = getattr(db_image.file, "path", None) if db_image.file else None
    if image_path_attr:
        image_path = Path(image_path_attr)
        try:
            await to_thread.run_sync(process_image_for_storage, image_path)
        except (ValueError, OSError) as e:
            logger.warning("Image processing failed for image %s, rolling back: %s", image_id, e)
            await delete_image(db, image_id)
            raise ValueError(str(e)) from e

    return db_image


async def update_image(db: AsyncSession, image_id: UUID4, image: ImageUpdate) -> Image:
    """Update an existing image in the database."""
    try:
        db_image: Image = await get_model_or_404(db, Image, image_id)
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
        raise ModelFileNotFoundError(Image, image_id, details=e.message) from e

    image_data: dict[str, Any] = image.model_dump(exclude_unset=True)
    db_image.sqlmodel_update(image_data)

    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)

    return db_image


async def delete_image(db: AsyncSession, image_id: UUID4) -> None:
    """Delete an image from the database and remove it from storage."""
    try:
        db_image = await get_model_or_404(db, Image, image_id)
        file_path = Path(getattr(db_image.file, "path", None)) if db_image.file else None
    except FastAPIStorageFileNotFoundError, ModelFileNotFoundError:
        # File missing from storage but exists in DB - proceed with DB cleanup
        db_image = await db.get(Image, image_id)
        file_path = None

    await db.delete(db_image)
    await db.commit()

    if file_path:
        await delete_file_from_storage(file_path)


### Video CRUD operations ###
async def create_video(
    db: AsyncSession,
    video: VideoCreate | VideoCreateWithinProduct,
    product_id: int | None = None,
    *,
    commit: bool = True,
) -> Video:
    """Create a new video in the database, optionally linked to a product."""
    if isinstance(video, VideoCreate):
        product_id = video.product_id
    if product_id:
        await get_model_or_404(db, Product, product_id)

    db_video = Video(
        **video.model_dump(exclude={"product_id"}),
        product_id=product_id,
    )
    db.add(db_video)

    if commit:
        await db.commit()
        await db.refresh(db_video)
    else:
        await db.flush()

    return db_video


async def update_video(db: AsyncSession, video_id: int, video: VideoUpdate | VideoUpdateWithinProduct) -> Video:
    """Update an existing video in the database."""
    db_video: Video = await get_model_or_404(db, Video, video_id)

    db_video.sqlmodel_update(video.model_dump(exclude_unset=True))
    db.add(db_video)
    await db.commit()
    await db.refresh(db_video)
    return db_video


async def delete_video(db: AsyncSession, video_id: int) -> None:
    """Delete a video from the database."""
    db_video: Video = await get_model_or_404(db, Video, video_id)

    await db.delete(db_video)
    await db.commit()


### Parent CRUD operations ###
P = TypeVar("P")  # Parent model
S = TypeVar("S", File, Image)  # Storage model (constrained to File or Image)
C = TypeVar("C", FileCreate, ImageCreateFromForm)  # Create schema (constrained to available schemas)
F = TypeVar("F", bound=Filter)  # Filter schema (must have .filter() method)


class ParentStorageOperations[P, S, C, F]:
    """Generic Create, Read, and Delete operations for managing files/images attached to a parent model."""

    def __init__(
        self,
        parent_model: type[MT],
        storage_model: type[File | Image],
        parent_type: MediaParentType,
        parent_field: str,
        create_func: Callable[[AsyncSession, Any], Any],
        delete_func: Callable[[AsyncSession, UUID4], Any],
    ) -> None:
        self.parent_model = parent_model
        self.storage_model = storage_model
        self.parent_type = parent_type
        self.parent_field = parent_field
        self._create = create_func
        self._delete = delete_func

    async def get_all(
        self,
        db: AsyncSession,
        parent_id: int,
        *,
        filter_params: F | None = None,
    ) -> Sequence[File | Image]:
        """Get all storage items for a parent, excluding items with missing files."""
        # Verify parent exists
        await get_model_or_404(db, self.parent_model, parent_id)

        statement = select(self.storage_model).where(
            getattr(self.storage_model, self.parent_field) == parent_id,
            self.storage_model.parent_type == self.parent_type,
        )

        if filter_params:
            # Cast to Filter to access the filter() method
            statement = cast("Filter", filter_params).filter(statement)

        items = list((await db.exec(statement)).all())
        valid_items = [item for item in items if item.file_exists]
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
        # Verify parent exists
        await get_model_or_404(db, self.parent_model, parent_id)

        storage_model_name: str = self.storage_model.get_api_model_name().name_capital
        parent_model_name: str = self.parent_model.get_api_model_name().name_capital

        # Get item and verify ownership
        try:
            db_item = await db.get(self.storage_model, item_id)
        except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError) as e:
            raise ModelFileNotFoundError(self.storage_model, item_id, details=str(e)) from e
        if not db_item:
            err_msg = f"{storage_model_name} with id {item_id} not found"
            raise ValueError(err_msg)

        if getattr(db_item, self.parent_field) != parent_id:
            err_msg: str = f"{storage_model_name} {item_id} does not belong to {parent_model_name} {parent_id}"
            raise ValueError(err_msg)

        if not db_item.file_exists:
            raise FastAPIStorageFileNotFoundError(filename=getattr(db_item, "filename", str(item_id)))

        return db_item

    @overload
    async def create(
        self,
        db: AsyncSession,
        parent_id: int,
        item_data: FileCreate,
    ) -> File: ...

    @overload
    async def create(
        self,
        db: AsyncSession,
        parent_id: int,
        item_data: ImageCreateFromForm,
    ) -> Image: ...
    async def create(
        self,
        db: AsyncSession,
        parent_id: int,
        item_data: C,
    ) -> File | Image:
        """Create a new storage item for a parent."""
        # Set parent data on the create schema
        # Cast to the union type to access parent_type and parent_id attributes
        create_schema = cast("FileCreate | ImageCreateFromForm", item_data)
        # Cast parent_type to Any since the union type checker can't verify the narrowing
        create_schema.parent_type = cast("Any", self.parent_type)
        create_schema.parent_id = parent_id

        return await self._create(db, item_data)

    async def delete(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> None:
        """Delete a storage item from a parent."""
        # Verify parent exists
        await get_model_or_404(db, self.parent_model, parent_id)

        # First verify the item exists and belongs to the parent
        await self.get_by_id(db, parent_id, item_id)

        # Then delete it
        await self._delete(db, item_id)

    async def delete_all(self, db: AsyncSession, parent_id: int) -> None:
        """Delete all storage items associated with a parent.

        Args:
            db: Database session
            parent_id: ID of parent to delete items from

        Returns:
            List of deleted items
        """
        # Get all items for this parent
        items: Sequence[File | Image] = await self.get_all(db, parent_id)

        # Delete each item
        for item in items:
            if item.id is not None:
                await self._delete(db, item.id)
