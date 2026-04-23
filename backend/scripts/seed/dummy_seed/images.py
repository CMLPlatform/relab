"""Dummy image seeding."""

from __future__ import annotations

import io
import logging
import mimetypes
from typing import TYPE_CHECKING

from anyio import Path as AnyIOPath
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import Headers

from app.api.file_storage.crud.media_queries import create_image
from app.api.file_storage.models import Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateFromForm
from app.core.config import settings

from .data import image_data

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pathlib import Path


async def seed_images(session: AsyncSession, product_id_map: dict[str, int]) -> None:
    """Seed the database with initial image data."""
    for data in image_data:
        filename = data.get("filename")
        if not filename:
            continue
        path: Path = settings.static_files_path / "images" / filename

        async_path = AnyIOPath(path)
        if not await async_path.is_file():
            logger.warning("Image not found at %s, skipping.", path)
            continue

        description: str = data.get("description", "")
        parent_id = product_id_map.get(data["parent_product_name"])
        if not parent_id:
            logger.warning("Skipping image %s: parent not found", path.name)
            continue

        existing_stmt = (
            select(Image.id).where(Image.parent_id == parent_id, Image.parent_type == MediaParentType.PRODUCT).limit(1)
        )
        if (await session.execute(existing_stmt)).scalars().first():
            logger.info("Product %s already has images, skipping.", data["parent_product_name"])
            continue

        size = (await async_path.stat()).st_size
        mime_type, _ = mimetypes.guess_type(path)
        if mime_type is None:
            err_msg = f"Could not determine MIME type for image file {path.name}."
            raise ValueError(err_msg)

        async with await async_path.open("rb") as file:
            file_content = await file.read()

        upload_file = UploadFile(
            file=io.BytesIO(file_content),
            filename=path.name,
            size=size,
            headers=Headers(
                {
                    "filename": path.name,
                    "size": str(size),
                    "content-type": mime_type,
                }
            ),
        )

        image_create = ImageCreateFromForm(
            description=description,
            file=upload_file,
            parent_id=parent_id,
            parent_type=MediaParentType.PRODUCT,
        )
        await create_image(session, image_create)
