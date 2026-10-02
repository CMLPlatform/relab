"""Service classes and query helpers for file-backed media CRUD."""

import logging
from dataclasses import dataclass
from functools import partial
from typing import TYPE_CHECKING, Any

from anyio import to_thread
from fastapi import UploadFile
from pydantic import UUID4
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.roles import UserRole, image_upload_max_mb_for_role, image_upload_max_pixels_for_role
from app.api.common.crud.exceptions import ModelNotFoundError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.query import require_locked_model, require_model
from app.api.common.exceptions import BadRequestError
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
from app.api.file_storage.upload_quota import (
    release_product_upload_quota_for_media,
    reserve_product_upload_quota,
)
from app.api.file_storage.upload_security import scan_upload_or_raise
from app.core.config.core import settings
from app.core.images import generate_thumbnails, image_resize_limiter, process_image_for_storage

from .support_paths import delete_file_from_storage, delete_image_from_storage, stored_file_path
from .support_types import StorageCreateSchema, StorageModel
from .support_uploads import (
    build_storage_instance,
    measure_file_size,
    process_uploadfile_name,
    validate_upload_size,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from uuid import UUID

    from app.api.common.crud.filtering import BaseFilterSet
    from app.api.file_storage.models.storage_core import BaseStorage

logger = logging.getLogger(__name__)


async def ensure_parent_exists(db: AsyncSession, parent_type: MediaParentType, parent_id: int) -> None:
    """Validate that the target parent record exists."""
    parent_model = parent_model_for_type(parent_type)
    await require_model(db, parent_model, parent_id)


async def get_parent_owned_storage_item[StorageModelT: StorageModel](
    db: AsyncSession,
    *,
    model: type[StorageModelT],
    parent_id: int,
    item_id: UUID4,
    parent_type: MediaParentType,
) -> StorageModelT:
    """Fetch a storage item and verify that it belongs to the scoped parent."""
    await ensure_parent_exists(db, parent_type, parent_id)
    statement = select(model).where(
        model.id == item_id,
        model.parent_id == parent_id,
        model.parent_type == parent_type,
    )
    db_item = (await db.execute(statement)).scalars().unique().one_or_none()
    if db_item is None:
        raise ModelNotFoundError(model, item_id)
    return db_item


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
    return apply_filter(statement, filter_params)


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


async def _process_image_upload(upload_file: UploadFile) -> dict[str, Any]:
    """Strip metadata from an image upload and bake in its rotation, before it is stored.

    Runs on the upload itself, not on the stored file, so every storage backend (S3 has
    no local file to post-process) receives the cleaned bytes. Returns the post-rotation
    dimensions for the row.
    """
    try:
        width_px, height_px = await to_thread.run_sync(
            process_image_for_storage, upload_file.file, limiter=image_resize_limiter()
        )
    except (ValueError, OSError) as e:
        raise BadRequestError(str(e)) from e
    return {"width_px": width_px, "height_px": height_px}


async def _generate_image_thumbnails(db_image: Image) -> None:
    """Generate the thumbnail set for a locally stored image."""
    image_path = stored_file_path(db_image)
    if image_path is None:
        return

    # Every width is generated here, before the response, so nothing is left for later:
    # image size is capped per role (at most MAX_IMAGE_PIXELS) and JPEGs decode through `draft`, which
    # keeps the whole set to roughly 110 ms at 12 MP. A failure is not fatal: the
    # original is stored and `build_thumbnail_urls_by_width` stat-checks each width, so
    # a missing one falls back to the original rather than publishing a broken URL.
    try:
        await to_thread.run_sync(generate_thumbnails, image_path, limiter=image_resize_limiter())
    except ValueError, OSError:
        logger.warning("Thumbnail generation failed for image %s, skipping", db_image.id, exc_info=True)


@dataclass
class StoredMediaService[StorageModelT: StorageModel, CreateSchemaT: StorageCreateSchema]:
    """Create/delete operations on one kind of stored media."""

    model: type[StorageModelT]
    get_storage: Callable[[], BaseStorage]
    # Checks the upload's metadata, size and content against the caps of the uploader's
    # tier, and returns its size in bytes.
    validate_upload: Callable[[CreateSchemaT, UserRole], Awaitable[int]]

    async def create(
        self,
        db: AsyncSession,
        payload: CreateSchemaT,
        *,
        caps_role: UserRole,
        quota_user_id: UUID | None = None,
    ) -> StorageModelT:
        """Create a file-backed model, store the upload, and persist the DB row.

        ``caps_role`` is the uploader's tier for the per-upload caps; the quota is charged
        to the parent's owner regardless.
        """
        if payload.file.filename is None:
            msg = "File name is empty"
            raise BadRequestError(msg)

        # A missing parent answers 404 before any cap is checked.
        await ensure_parent_exists(db, payload.parent_type, payload.parent_id)
        upload_size_bytes = await self.validate_upload(payload, caps_role)
        await scan_upload_or_raise(payload.file)
        extra_fields: dict[str, Any] = {}
        if self.model is Image:
            # Images are rewritten before any storage backend receives them.
            extra_fields = await _process_image_upload(payload.file)
            # The caps above apply to what was sent; the quota and the row count what is stored.
            upload_size_bytes = await to_thread.run_sync(measure_file_size, payload.file.file)
        payload.file, file_id, original_filename, stored_filename = process_uploadfile_name(payload.file)
        if quota_user_id is not None:
            # quota_user_id gates whether this upload counts against quota (product
            # media only); the charge itself always targets the parent's owner.
            await reserve_product_upload_quota(db, parent_id=payload.parent_id, upload_size_bytes=upload_size_bytes)

        stored_name = await self.get_storage().write_upload(payload.file, stored_filename)
        db_item = build_storage_instance(
            model=self.model,
            file_id=file_id,
            upload_size_bytes=upload_size_bytes,
            original_filename=original_filename,
            stored_name=stored_name,
            payload=payload,
            **extra_fields,
        )

        db.add(db_item)
        await db.commit()
        await db.refresh(db_item)
        if isinstance(db_item, Image):
            await _generate_image_thumbnails(db_item)
        return db_item

    async def delete(self, db: AsyncSession, item_id: UUID4) -> None:
        """Delete a file-backed model and best-effort clean up its storage file."""
        db_item = await require_locked_model(db, self.model, item_id)
        await db.delete(db_item)
        await release_product_upload_quota_for_media(db, db_item)
        await db.commit()

        # Backend deletes are idempotent for a missing object, so no path gating (None on S3).
        if isinstance(db_item, Image):
            await delete_image_from_storage(db_item)
        else:
            await delete_file_from_storage(db_item)


async def _validate_file_upload(payload: FileCreate, _caps_role: UserRole) -> int:
    validate_generic_file_upload_metadata(payload.file)
    upload_size_bytes = await validate_upload_size(payload.file, settings.max_file_upload_size_mb)
    await to_thread.run_sync(validate_generic_file_upload_content, payload.file)
    return upload_size_bytes


async def _validate_image_upload(payload: ImageCreateFromForm | ImageCreateInternal, role: UserRole) -> int:
    """Images meet the size and pixel caps of the uploader's tier."""
    validate_image_upload_metadata(payload.file)
    upload_size_bytes = await validate_upload_size(payload.file, image_upload_max_mb_for_role(role))
    await to_thread.run_sync(
        partial(validate_image_upload_content, max_pixels=image_upload_max_pixels_for_role(role)), payload.file
    )
    return upload_size_bytes


file_storage_service: StoredMediaService[File, FileCreate] = StoredMediaService(
    model=File,
    get_storage=_get_file_storage,
    validate_upload=_validate_file_upload,
)
image_storage_service: StoredMediaService[Image, ImageCreateFromForm | ImageCreateInternal] = StoredMediaService(
    model=Image,
    get_storage=_get_image_storage,
    validate_upload=_validate_image_upload,
)
