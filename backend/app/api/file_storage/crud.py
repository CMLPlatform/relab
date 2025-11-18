"""CRUD operations for file storage models."""

import logging
import uuid
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, Generic, TypeVar

from anyio import to_thread
from fastapi import UploadFile
from fastapi_filter.contrib.sqlalchemy import Filter
from PIL import Image as PILImage
from pydantic import UUID4
from slugify import slugify
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.crud.base import get_models
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists, get_file_parent_type_model
from app.api.common.models.custom_types import MT
from app.api.data_collection.models import Product
from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError, ModelFileNotFoundError
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, FileParentType, Image, ImageParentType, Video
from app.api.file_storage.schemas import (
    FileCreate,
    FileUpdate,
    ImageCreateFromForm,
    ImageCreateInternal,
    ImageUpdate,
    VideoCreate,
    VideoCreateWithinProduct,
    VideoUpdate,
)

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
    if file_path.exists():
        await to_thread.run_sync(file_path.unlink)


async def generate_thumbnail(image_path: Path, thumbnail_size: tuple[int, int] = (400, 400), quality: int = 85) -> Path | None:
    """Generate a WebP thumbnail for an image.

    Args:
        image_path: Path to the original image
        thumbnail_size: Size of the thumbnail (default 400x400)
        quality: WebP quality (default 85%)

    Returns:
        Path to the generated thumbnail, or None if generation failed
    """
    try:
        # Generate thumbnail path
        thumbnail_path = image_path.parent / f"{image_path.stem}_thumb.webp"

        def _create_thumbnail() -> None:
            """Synchronous thumbnail creation."""
            with PILImage.open(image_path) as img:
                # Convert RGBA to RGB if necessary (WebP doesn't handle all alpha modes well)
                if img.mode in ("RGBA", "LA", "P"):
                    # Create white background
                    background = PILImage.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Create thumbnail maintaining aspect ratio
                img.thumbnail(thumbnail_size, PILImage.Resampling.LANCZOS)

                # Save as WebP
                img.save(thumbnail_path, "WEBP", quality=quality, method=6)

        # Run thumbnail creation in thread pool
        await to_thread.run_sync(_create_thumbnail)

        logger.info("Generated thumbnail for image %s at %s", image_path, thumbnail_path)
        return thumbnail_path

    except Exception as e:
        logger.warning("Failed to generate thumbnail for image %s: %s", image_path, e)
        return None


### File CRUD operations ###
## Basic CRUD operations ##
async def get_files(db: AsyncSession, *, file_filter: FileFilter | None = None) -> Sequence[File]:
    """Get all files from the database."""
    # TODO: Handle missing files in storage
    return await get_models(db, File, model_filter=file_filter)


async def get_file(db: AsyncSession, file_id: UUID4) -> File:
    """Get a file from the database."""
    try:
        return await db_get_model_with_id_if_it_exists(db, File, file_id)
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
    await db_get_model_with_id_if_it_exists(db, parent_model, file_data.parent_id)

    db_file = File(
        id=file_id,
        description=file_data.description,
        filename=original_filename,
        file=file_data.file,  # pyright: ignore [reportArgumentType] # Incoming UploadFile cannot be preemptively cast to FileType because of how FastAPI-storages works.
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
        db_file = await db_get_model_with_id_if_it_exists(db, File, file_id)
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
        db_file = await db_get_model_with_id_if_it_exists(db, File, file_id)
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
        return await db_get_model_with_id_if_it_exists(db, Image, image_id)
    except FastAPIStorageFileNotFoundError as e:
        raise ModelFileNotFoundError(Image, image_id, details=e.message) from e


async def create_image(db: AsyncSession, image_data: ImageCreateFromForm | ImageCreateInternal) -> Image:
    """Create a new image in the database and save it."""
    if image_data.file.filename is None:
        err_msg = "File name is empty"
        raise ValueError(err_msg)

    # Generate ID before creating File to store in local filesystem
    image_data.file, image_id, original_filename = process_uploadfile_name(image_data.file)

    # Verify parent exists (will raise ModelNotFoundError if not)
    parent_model = get_file_parent_type_model(image_data.parent_type)
    await db_get_model_with_id_if_it_exists(db, parent_model, image_data.parent_id)

    db_image = Image(
        id=image_id,
        description=image_data.description,
        image_metadata=image_data.image_metadata,
        filename=original_filename,
        file=image_data.file,  # pyright: ignore [reportArgumentType] # Incoming UploadFile cannot be preemptively cast to FileType because of how FastAPI-storages works.
        parent_type=image_data.parent_type,
    )

    # Set parent id
    db_image.set_parent(image_data.parent_type, image_data.parent_id)

    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)

    # Generate thumbnail after image is saved
    if db_image.file and Path(db_image.file.path).exists():
        thumbnail_path = await generate_thumbnail(Path(db_image.file.path))
        if thumbnail_path:
            db_image.thumbnail_path = str(thumbnail_path)
            db.add(db_image)
            await db.commit()
            await db.refresh(db_image)

    return db_image


async def update_image(db: AsyncSession, image_id: UUID4, image: ImageUpdate) -> Image:
    """Update an existing image in the database."""
    try:
        db_image: Image = await db_get_model_with_id_if_it_exists(db, Image, image_id)
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
        db_image = await db_get_model_with_id_if_it_exists(db, Image, image_id)
        file_path = Path(db_image.file.path) if db_image.file else None
        thumbnail_path = Path(db_image.thumbnail_path) if db_image.thumbnail_path else None
    except (FastAPIStorageFileNotFoundError, ModelFileNotFoundError):
        # TODO: test this scenario
        # File missing from storage but exists in DB - proceed with DB cleanup
        db_image = await db.get(Image, image_id)
        file_path = None
        thumbnail_path = None

    await db.delete(db_image)
    await db.commit()

    # Delete original image
    if file_path:
        await delete_file_from_storage(file_path)

    # Delete thumbnail if it exists
    if thumbnail_path:
        await delete_file_from_storage(thumbnail_path)


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
        await db_get_model_with_id_if_it_exists(db, Product, product_id)

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


async def update_video(db: AsyncSession, video_id: int, video: VideoUpdate) -> Video:
    """Update an existing video in the database."""
    db_video: Video = await db_get_model_with_id_if_it_exists(db, Video, video_id)

    db_video.sqlmodel_update(video.model_dump(exclude_unset=True))
    db.add(db_video)
    await db.commit()
    await db.refresh(db_video)
    return db_video


async def delete_video(db: AsyncSession, video_id: int) -> None:
    """Delete a video from the database."""
    db_video: Video = await db_get_model_with_id_if_it_exists(db, Video, video_id)

    await db.delete(db_video)
    await db.commit()


### Parent CRUD operations ###
StorageModel = TypeVar("StorageModel", File, Image)
CreateSchema = TypeVar("CreateSchema", FileCreate, ImageCreateFromForm)
FilterType = TypeVar("FilterType", bound=Filter)


class ParentStorageOperations[MT, StorageModel, CreateSchema, FilterType]:
    """Generic Create, Read, and Delete operations for managing files/images attached to a parent model."""

    def __init__(
        self,
        parent_model: type[MT],
        storage_model: type[StorageModel],
        parent_type: FileParentType | ImageParentType,
        parent_field: str,
        create_func: Callable,
        delete_func: Callable,
    ):
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
        filter_params: FilterType | None = None,
    ) -> Sequence[StorageModel]:
        """Get all storage items for a parent."""
        # TODO: Handle missing files in storage
        # Verify parent exists
        await db_get_model_with_id_if_it_exists(db, self.parent_model, parent_id)

        statement = select(self.storage_model).where(
            getattr(self.storage_model, self.parent_field) == parent_id,
            self.storage_model.parent_type == self.parent_type,
        )

        if filter_params:
            statement = filter_params.filter(statement)

        return (await db.exec(statement)).all()

    async def get_by_id(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> StorageModel:
        """Get a specific storage item for a parent."""
        # Verify parent exists
        await db_get_model_with_id_if_it_exists(db, self.parent_model, parent_id)

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

        return db_item

    async def create(
        self,
        db: AsyncSession,
        parent_id: int,
        item_data: CreateSchema,
    ) -> StorageModel:
        """Create a new storage item for a parent."""
        # Set parent data
        item_data.parent_type = self.parent_type
        item_data.parent_id = parent_id

        return await self._create(db, item_data)

    async def delete(self, db: AsyncSession, parent_id: int, item_id: UUID4) -> None:
        """Delete a storage item from a parent."""
        # Verify parent exists
        await db_get_model_with_id_if_it_exists(db, self.parent_model, parent_id)

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
        items: Sequence[StorageModel] = await self.get_all(db, parent_id)

        # Delete each item
        for item in items:
            await self._delete(db, item.id)
