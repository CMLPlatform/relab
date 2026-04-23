"""CRUD entrypoints for file and image rows."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.filtering import apply_filter
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models import File, Image
from app.api.file_storage.schemas import FileCreate, FileUpdate, ImageCreateFromForm, ImageCreateInternal, ImageUpdate

from .support_queries import (
    get_storage_item_or_raise,
    update_storage_item,
)
from .support_services import (
    file_storage_service,
    image_storage_service,
)

if TYPE_CHECKING:
    from collections.abc import Sequence


async def get_files(db: AsyncSession, *, file_filter: FileFilter | None = None) -> Sequence[File]:
    """Get all files from the database."""
    statement: Select[tuple[File]] = select(File)
    statement = apply_filter(statement, File, file_filter)
    return list((await db.execute(statement)).scalars().unique().all())


async def get_file(db: AsyncSession, file_id: UUID4) -> File:
    """Get a file from the database."""
    return await get_storage_item_or_raise(db, File, file_id)


async def create_file(db: AsyncSession, file_data: FileCreate) -> File:
    """Create a new file in the database and save it."""
    return await file_storage_service.create(db, file_data)


async def update_file(db: AsyncSession, file_id: UUID4, file: FileUpdate) -> File:
    """Update an existing file in the database."""
    return await update_storage_item(db, File, file_id, file)


async def delete_file(db: AsyncSession, file_id: UUID4) -> None:
    """Delete a file from the database and remove it from storage."""
    await file_storage_service.delete(db, file_id)


async def get_images(db: AsyncSession, *, image_filter: ImageFilter | None = None) -> Sequence[Image]:
    """Get all images from the database."""
    statement: Select[tuple[Image]] = select(Image)
    statement = apply_filter(statement, Image, image_filter)
    return list((await db.execute(statement)).scalars().unique().all())


async def get_image(db: AsyncSession, image_id: UUID4) -> Image:
    """Get an image from the database."""
    return await get_storage_item_or_raise(db, Image, image_id)


async def create_image(db: AsyncSession, image_data: ImageCreateFromForm | ImageCreateInternal) -> Image:
    """Create a new image in the database and save it."""
    return await image_storage_service.create(db, image_data)


async def update_image(db: AsyncSession, image_id: UUID4, image: ImageUpdate) -> Image:
    """Update an existing image in the database."""
    return await update_storage_item(db, Image, image_id, image)


async def delete_image(db: AsyncSession, image_id: UUID4) -> None:
    """Delete an image from the database and remove it from storage."""
    await image_storage_service.delete(db, image_id)
