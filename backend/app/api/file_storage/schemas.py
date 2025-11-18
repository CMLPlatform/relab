"""Pydantic models used to validate CRUD operations for file data."""

from typing import Annotated, Any

from fastapi import UploadFile
from pydantic import AfterValidator, Field, HttpUrl, Json, PositiveInt

from app.api.common.models.custom_types import IDT
from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp, BaseUpdateSchema
from app.api.file_storage.models.models import FileBase, FileParentType, ImageBase, ImageParentType, VideoBase

### Constants ###
MAX_FILE_SIZE_MB = 50

ALLOWED_IMAGE_MIME_TYPES: set[str] = {
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
}
MAX_IMAGE_SIZE_MB = 10


### Common Validation ###
def validate_file_size(file: UploadFile | None, max_size_mb: int) -> UploadFile | None:
    """Validate the file size against a maximum size limit."""
    if file is None:
        return file
    if file.size is None or file.size == 0:
        err_msg: str = "File size is None or zero."
        raise ValueError(err_msg)
    if file.size > max_size_mb * 1024 * 1024:
        err_msg: str = f"File size too large: {file.size / 1024 / 1024:.2f} MB. Maximum size: {max_size_mb} MB"
        raise ValueError(err_msg)
    return file


def validate_filename(file: UploadFile | None) -> UploadFile | None:
    """Validate the image file name."""
    if file is None:
        return file
    if not file.filename:
        err_msg = "File name is empty."
        raise ValueError(err_msg)
    return file


AT = Any  # HACK: To avoid type issues


def empty_str_to_none(v: AT) -> AT | None:
    """Convert empty strings in request form to None."""
    if v == "":
        return None
    return v


### File Schemas ###
class FileCreateWithinParent(BaseCreateSchema, FileBase):
    """Schema for creating a file within a parent object."""

    file: Annotated[
        UploadFile,
        AfterValidator(validate_filename),
        AfterValidator(lambda f: validate_file_size(f, MAX_FILE_SIZE_MB)),
    ]


class FileCreate(FileCreateWithinParent):
    """Schema for creating a file."""

    # HACK: Even though the parent_id is optional, it should be required in the request.
    # It is optional to allow for the currently messy storage crud and router factories to work
    parent_id: IDT | None = None
    parent_type: FileParentType | None = Field(
        default=None, description=f"Type of the parent object, e.g. {', '.join(t.value for t in FileParentType)}"
    )


class FileReadWithinParent(BaseReadSchemaWithTimeStamp, FileBase):
    """Schema for reading file information within a parent object."""

    filename: str
    file_url: str


class FileRead(FileReadWithinParent):
    """Schema for reading file information."""

    parent_id: PositiveInt = Field(description="ID of the parent object")
    parent_type: FileParentType = Field(
        description=f"Type of the parent object, e.g. {', '.join(t.value for t in FileParentType)}"
    )


class FileUpdate(BaseUpdateSchema, FileBase):
    """Schema for updating a file description."""

    # Only includes fields from FileBase (description)
    # If the user wants to update the file or reassign to a new parent object,
    # they should delete the old file and create a new one.


### Image Schemas ###
def validate_image_type(file: UploadFile | None) -> UploadFile | None:
    """Validate the image file mime type."""
    if file is None:
        return file
    allowed_mime_types: set[str] = ALLOWED_IMAGE_MIME_TYPES
    if file.content_type not in allowed_mime_types:
        err_msg: str = f"Invalid file type: {file.content_type}. Allowed types: {', '.join(allowed_mime_types)}"
        raise ValueError(err_msg)
    return file


class ImageCreateInternal(BaseCreateSchema, ImageBase):
    """Schema for creating a new image internally, without a form upload."""

    file: Annotated[
        UploadFile,
        AfterValidator(validate_filename),
        AfterValidator(validate_image_type),
        AfterValidator(lambda f: validate_file_size(f, MAX_IMAGE_SIZE_MB)),
    ]
    # HACK: Even though the parent_id is optional, it should be required in the request.
    # It is optional to allow for the currently messy storage crud and router factories to work
    parent_id: IDT | None = None
    parent_type: ImageParentType | None = Field(
        default=None, description=f"Type of the parent object, e.g. {', '.join(t.value for t in ImageParentType)}"
    )


class ImageCreateFromForm(ImageCreateInternal):
    """Schema for creating a new image from Form data.

    Parses image metadata from a JSON string in a form field, allowing file and metadata upload in one request.
    """

    # Overriding the ImageBase field to allow for JSON validation
    image_metadata: Json | None = Field(default=None, description="Image metadata in JSON string format")


class ImageReadWithinParent(BaseReadSchemaWithTimeStamp, ImageBase):
    """Schema for reading image information within a parent object."""

    filename: str
    image_url: str
    thumbnail_url: str


class ImageRead(ImageReadWithinParent):
    """Schema for reading image information."""

    parent_id: PositiveInt
    parent_type: ImageParentType = Field(
        description=f"Type of the object that the image belongs to, e.g. {', '.join(t.value for t in ImageParentType)}",
    )


class ImageUpdate(BaseUpdateSchema, ImageBase):
    """Schema for updating an image description."""

    # Only includes fields from ImageBase.
    # If the user wants to update the image file or reassign to a new parent object,
    # they should delete the old image and create a new one.
    # TODO: Add logic to reassign to new parent object


### Video Schemas ###
class VideoCreateWithinProduct(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""


class VideoCreate(BaseCreateSchema, VideoBase):
    """Schema for creating a video."""

    product_id: PositiveInt


class VideoReadWithinProduct(BaseReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information."""


class VideoRead(BaseReadSchemaWithTimeStamp, VideoBase):
    """Schema for reading video information."""

    product_id: PositiveInt


class VideoUpdate(BaseUpdateSchema):
    """Schema for updating a video."""

    url: HttpUrl | None = Field(default=None, max_length=250, description="HTTP(S) URL linking to the video")
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(default=None, description="Video metadata as a JSON dict")
    product_id: PositiveInt
