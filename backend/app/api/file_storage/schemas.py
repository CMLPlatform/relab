"""Pydantic models used to validate file storage CRUD operations."""

from typing import Annotated, Any, Self

from fastapi import UploadFile
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PositiveInt, model_validator

from app.api.common.schemas.base import (
    BaseCreateSchema,
    BaseUpdateSchema,
    IntIdReadSchemaWithTimeStamp,
    UUIDIdReadSchemaWithTimeStamp,
)
from app.api.common.schemas.custom_fields import HttpUrlToDB
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.api.file_storage.examples import (
    FILE_READ_WITHIN_PARENT_EXAMPLES,
    IMAGE_READ_WITHIN_PARENT_EXAMPLES,
    VIDEO_CREATE_WITHIN_PRODUCT_EXAMPLES,
    VIDEO_READ_WITHIN_PRODUCT_EXAMPLES,
    VIDEO_UPDATE_WITHIN_PRODUCT_EXAMPLES,
)
from app.api.file_storage.models import MediaParentType
from app.core.config import settings
from app.core.images.urls import build_image_urls, build_storage_url, build_thumbnail_urls_by_width

PARENT_TYPE_DESCRIPTION = f"Type of the parent object, e.g. {', '.join(parent.value for parent in MediaParentType)}"


class FileBase(BaseModel):
    """Shared base fields for file schemas."""

    description: MultilineUserText | None = None


class ImageBase(BaseModel):
    """Shared base fields for image schemas."""

    description: MultilineUserText | None = None
    image_metadata: dict[str, Any] | None = None


class VideoBase(BaseModel):
    """Shared base fields for video schemas."""

    url: str
    title: SingleLineUserText | None = None
    description: MultilineUserText | None = None
    video_metadata: dict[str, Any] | None = None


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


FileUpload = Annotated[
    UploadFile,
    AfterValidator(validate_filename),
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
            self.file_url = build_storage_url(file_path, settings.file_storage_path, "/uploads/files")
        return self


class FileRead(FileReadWithinParent):
    """Schema for reading file information."""

    parent_id: PositiveInt = Field(description="ID of the parent object")
    parent_type: MediaParentType = Field(description=PARENT_TYPE_DESCRIPTION)


class FileUpdate(BaseUpdateSchema, FileBase):
    """Schema for updating a file description."""


class ImageCreateInternal(BaseCreateSchema, ImageBase):
    """Schema for creating a new image internally, without a form upload."""

    file: FileUpload
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
    width_px: int | None = Field(
        default=None,
        description=(
            "Pixel width of the stored image, after any EXIF rotation. Null for images uploaded "
            "before dimensions were recorded whose file could not be measured since, and for "
            "remotely stored (S3) images. With `height_px` this gives the aspect ratio every "
            "entry in `thumbnail_urls` shares, so a client can reserve layout space before the "
            "image loads and derive each derivative's height from its width."
        ),
    )
    height_px: int | None = Field(default=None, description="Pixel height of the stored image, after rotation.")
    thumbnail_urls: dict[int, str] = Field(
        default_factory=dict,
        description=(
            "Pre-computed thumbnail URLs keyed by width in pixels. Only widths that exist for this "
            "image are present: narrower originals yield fewer entries. Pick the width you render "
            "at rather than scaling `thumbnail_url`, which is always the smallest, list-sized one."
        ),
        # JSON object keys are strings; tell generated clients they are decimal widths.
        json_schema_extra={"propertyNames": {"pattern": "^[1-9][0-9]*$"}},
    )

    @model_validator(mode="after")
    def _derive_image_urls(self) -> Self:
        """Derive image and thumbnail URLs when the caller didn't supply them."""
        file_path = getattr(self.file, "path", None)
        if self.image_url is None:
            self.image_url, self.thumbnail_url = build_image_urls(file_path, settings.image_storage_path)
        if not self.thumbnail_urls:
            self.thumbnail_urls = build_thumbnail_urls_by_width(file_path, settings.image_storage_path, self.width_px)
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

    url: HttpUrlToDB


class VideoCreate(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    url: HttpUrlToDB
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

    url: HttpUrlToDB | None = Field(default=None, description="URL linking to the video")
    title: SingleLineUserText | None = Field(default=None, max_length=100, description="Title of the video")
    description: MultilineUserText | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(default=None, description="Video metadata as a JSON dict")


class VideoUpdate(VideoUpdateWithinProduct):
    """Schema for updating a video."""

    product_id: PositiveInt
