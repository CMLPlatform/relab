"""Pydantic models used to validate file storage CRUD operations."""

from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any, cast
from urllib.parse import quote

from fastapi import UploadFile
from pydantic import AfterValidator, Field, PositiveInt, model_validator

from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp, BaseUpdateSchema
from app.api.common.schemas.custom_fields import AnyUrlToDB
from app.api.file_storage.models.models import FileBase, ImageBase, MediaParentType, VideoBase
from app.core.config import settings
from app.core.images import validate_image_mime_type

if TYPE_CHECKING:
    from os import PathLike

MAX_FILE_SIZE_MB = 50
MAX_IMAGE_SIZE_MB = 10
PARENT_TYPE_DESCRIPTION = f"Type of the parent object, e.g. {', '.join(parent.value for parent in MediaParentType)}"


def validate_filename(file: UploadFile | None) -> UploadFile | None:
    """Validate that the uploaded file has a filename."""
    if file is None:
        return file
    if not file.filename:
        err_msg = "File name is empty."
        raise ValueError(err_msg)
    return file


def empty_str_to_none(value: object) -> object | None:
    """Convert empty strings in request form to None."""
    if value == "":
        return None
    return value


def _build_storage_url(path: str | PathLike[str] | None, storage_root: Path, url_prefix: str) -> str | None:
    """Build a public URL for a stored file-backed object from its filesystem path."""
    if path is None:
        return None

    file_path = Path(path)
    if not file_path.exists():
        return None

    relative_path = file_path.relative_to(storage_root)
    return f"{url_prefix}/{quote(str(relative_path))}"


def _build_image_urls(
    file_path: str | None,
    image_id: int | None,
    storage_root: Path,
) -> tuple[str | None, str | None]:
    """Build image_url and thumbnail_url with a single filesystem existence check.

    Returns (image_url, thumbnail_url) — both None if the file does not exist.
    """
    if file_path is None:
        return None, None
    path = Path(file_path)
    if not path.exists():
        return None, None
    relative_path = path.relative_to(storage_root)
    return f"/uploads/images/{quote(str(relative_path))}", f"/images/{image_id}/resized?width=200"


FileUpload = Annotated[
    UploadFile,
    AfterValidator(validate_filename),
]

ImageUpload = Annotated[
    UploadFile,
    AfterValidator(validate_filename),
    AfterValidator(validate_image_mime_type),
]


class FileCreateWithinParent(BaseCreateSchema, FileBase):
    """Schema for creating a file within a parent object."""

    file: FileUpload


class FileCreate(FileCreateWithinParent):
    """Schema for creating a file."""

    parent_id: int = Field(description="ID of the parent object")
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class FileReadWithinParent(BaseReadSchemaWithTimeStamp, FileBase):
    """Schema for reading file information within a parent object."""

    filename: str
    file_url: str | None

    @model_validator(mode="before")
    @classmethod
    def populate_file_url(cls, data: object) -> object:
        """Populate ``file_url`` when validating directly from an ORM row."""
        if isinstance(data, dict):
            payload = cast("dict[str, Any]", data)
            if payload.get("file_url") is not None:
                return payload
            file_path = getattr(payload.get("file"), "path", None)
            return {
                **payload,
                "file_url": _build_storage_url(file_path, settings.file_storage_path, "/uploads/files"),
            }

        file_path = getattr(getattr(data, "file", None), "path", None)
        return {
            "id": getattr(data, "db_id", getattr(data, "id", None)),
            "description": getattr(data, "description", None),
            "filename": getattr(data, "filename", None),
            "file_url": _build_storage_url(file_path, settings.file_storage_path, "/uploads/files"),
            "created_at": getattr(data, "created_at", None),
            "updated_at": getattr(data, "updated_at", None),
            "parent_id": getattr(data, "product_id", None)
            or getattr(data, "material_id", None)
            or getattr(data, "product_type_id", None),
            "parent_type": getattr(data, "parent_type", None),
        }


class FileRead(FileReadWithinParent):
    """Schema for reading file information."""

    parent_id: PositiveInt = Field(description="ID of the parent object")
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class FileUpdate(BaseUpdateSchema, FileBase):
    """Schema for updating a file description."""


class ImageCreateInternal(BaseCreateSchema, ImageBase):
    """Schema for creating a new image internally, without a form upload."""

    file: ImageUpload
    parent_id: int = Field(description="ID of the parent object")
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class ImageCreateFromForm(ImageCreateInternal):
    """Schema for creating a new image from multipart form data."""

    image_metadata: dict[str, Any] | None = Field(
        default=None,
        description="Image metadata in JSON string format",
    )


class ImageReadWithinParent(BaseReadSchemaWithTimeStamp, ImageBase):
    """Schema for reading image information within a parent object."""

    filename: str
    image_url: str | None
    thumbnail_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def populate_image_urls(cls, data: object) -> object:
        """Populate image URLs when validating directly from an ORM row."""
        if isinstance(data, dict):
            payload = cast("dict[str, Any]", data)
            if payload.get("image_url") is not None:
                return payload
            file_path = getattr(payload.get("file"), "path", None)
            image_url, thumbnail_url = _build_image_urls(file_path, payload.get("id"), settings.image_storage_path)
            return {**payload, "image_url": image_url, "thumbnail_url": thumbnail_url}

        item_id = getattr(data, "db_id", getattr(data, "id", None))
        file_path = getattr(getattr(data, "file", None), "path", None)
        image_url, thumbnail_url = _build_image_urls(file_path, item_id, settings.image_storage_path)
        return {
            "id": item_id,
            "description": getattr(data, "description", None),
            "image_metadata": getattr(data, "image_metadata", None),
            "filename": getattr(data, "filename", None),
            "image_url": image_url,
            "thumbnail_url": thumbnail_url,
            "created_at": getattr(data, "created_at", None),
            "updated_at": getattr(data, "updated_at", None),
            "parent_id": getattr(data, "product_id", None)
            or getattr(data, "material_id", None)
            or getattr(data, "product_type_id", None),
            "parent_type": getattr(data, "parent_type", None),
        }


class ImageRead(ImageReadWithinParent):
    """Schema for reading image information."""

    parent_id: PositiveInt
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class ImageUpdate(BaseUpdateSchema, ImageBase):
    """Schema for updating an image description."""


class VideoCreateWithinProduct(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    url: AnyUrlToDB


class VideoCreate(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    url: AnyUrlToDB
    product_id: PositiveInt


class VideoReadWithinProduct(BaseReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information within a product."""


class VideoRead(BaseReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information."""

    product_id: PositiveInt


class VideoUpdateWithinProduct(BaseUpdateSchema):
    """Schema for updating a video within a product."""

    url: AnyUrlToDB | None = Field(default=None, description="URL linking to the video")
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(default=None, description="Video metadata as a JSON dict")


class VideoUpdate(VideoUpdateWithinProduct):
    """Schema for updating a video."""

    product_id: PositiveInt
