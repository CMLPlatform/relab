"""Pydantic models used to validate file storage CRUD operations."""

from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any, Self
from urllib.parse import quote

from fastapi import UploadFile
from pydantic import AfterValidator, ConfigDict, Field, PositiveInt, model_validator

from app.api.common.schemas.base import (
    BaseCreateSchema,
    BaseUpdateSchema,
    IntIdReadSchemaWithTimeStamp,
    UUIDIdReadSchemaWithTimeStamp,
)
from app.api.common.schemas.custom_fields import AnyUrlToDB
from app.api.file_storage.examples import (
    FILE_READ_WITHIN_PARENT_EXAMPLES,
    IMAGE_READ_WITHIN_PARENT_EXAMPLES,
    VIDEO_CREATE_WITHIN_PRODUCT_EXAMPLES,
    VIDEO_READ_WITHIN_PRODUCT_EXAMPLES,
    VIDEO_UPDATE_WITHIN_PRODUCT_EXAMPLES,
)
from app.api.file_storage.models import FileBase, ImageBase, MediaParentType, VideoBase
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
    image_id: object,
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


class FileReadWithinParent(UUIDIdReadSchemaWithTimeStamp, FileBase):
    """Schema for reading file information within a parent object."""

    model_config = ConfigDict(json_schema_extra={"examples": FILE_READ_WITHIN_PARENT_EXAMPLES})

    filename: str
    file: Any = Field(default=None, exclude=True)
    file_url: str | None = None

    @model_validator(mode="after")
    def _derive_file_url(self) -> Self:
        """Derive file_url from the underlying storage path when the caller didn't supply one."""
        if self.file_url is None:
            file_path = getattr(self.file, "path", None)
            self.file_url = _build_storage_url(file_path, settings.file_storage_path, "/uploads/files")
        return self


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


class ImageReadWithinParent(UUIDIdReadSchemaWithTimeStamp, ImageBase):
    """Schema for reading image information within a parent object."""

    model_config = ConfigDict(json_schema_extra={"examples": IMAGE_READ_WITHIN_PARENT_EXAMPLES})

    filename: str
    file: Any = Field(default=None, exclude=True)
    image_url: str | None = None
    thumbnail_url: str | None = None

    @model_validator(mode="after")
    def _derive_image_urls(self) -> Self:
        """Derive image and thumbnail URLs when the caller didn't supply them."""
        if self.image_url is None:
            file_path = getattr(self.file, "path", None)
            self.image_url, self.thumbnail_url = _build_image_urls(
                file_path, self.id, settings.image_storage_path
            )
        return self


class ImageRead(ImageReadWithinParent):
    """Schema for reading image information."""

    parent_id: PositiveInt
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class ImageUpdate(BaseUpdateSchema, ImageBase):
    """Schema for updating an image description."""


class VideoCreateWithinProduct(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    model_config = ConfigDict(json_schema_extra={"examples": VIDEO_CREATE_WITHIN_PRODUCT_EXAMPLES})

    url: AnyUrlToDB


class VideoCreate(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    url: AnyUrlToDB
    product_id: PositiveInt


class VideoReadWithinProduct(IntIdReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information within a product."""

    model_config = ConfigDict(json_schema_extra={"examples": VIDEO_READ_WITHIN_PRODUCT_EXAMPLES})


class VideoRead(IntIdReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information."""

    product_id: PositiveInt


class VideoUpdateWithinProduct(BaseUpdateSchema):
    """Schema for updating a video within a product."""

    model_config = ConfigDict(json_schema_extra={"examples": VIDEO_UPDATE_WITHIN_PRODUCT_EXAMPLES})

    url: AnyUrlToDB | None = Field(default=None, description="URL linking to the video")
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(default=None, description="Video metadata as a JSON dict")


class VideoUpdate(VideoUpdateWithinProduct):
    """Schema for updating a video."""

    product_id: PositiveInt
