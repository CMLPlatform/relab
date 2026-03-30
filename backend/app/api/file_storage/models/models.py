"""Database models for files, images and videos."""

import uuid
from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import UUID4, ConfigDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field
from sqlmodel import Enum as SAEnum

from app.api.common.models.base import (
    APIModelName,
    CustomBase,
    IntPrimaryKeyMixin,
    SingleParentMixin,
    TimeStampMixinBare,
)
from app.api.file_storage.models.storage import FileType, ImageType

if TYPE_CHECKING:
    from typing import Any, ClassVar


### Shared parent-type enum ###
class MediaParentType(StrEnum):
    """Parent entity types that can own files and images."""

    PRODUCT = "product"
    PRODUCT_TYPE = "product_type"
    MATERIAL = "material"


### File Model ###
class FileBase(CustomBase):
    """Base model for generic files stored in the local file system."""

    description: str | None = Field(default=None, max_length=500, description="Description of the file")

    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="File")


class File(FileBase, TimeStampMixinBare, SingleParentMixin[MediaParentType], table=True):
    """Database model for generic files stored in the local file system, using FastAPI-Storages."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    filename: str = Field(description="Original file name of the file. Automatically generated.")
    file: FileType = Field(sa_column=Column(FileType, nullable=False), description="Local file path to the file")

    parent_type: MediaParentType = Field(
        sa_column=Column(SAEnum(MediaParentType, name="fileparenttype"), nullable=False),
        description=SingleParentMixin.get_parent_type_description(MediaParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")
    material_id: int | None = Field(default=None, foreign_key="material.id")
    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")

    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True, use_enum_values=True)


### Image Model ###
class ImageBase(CustomBase):
    """Base model for images stored in the local file system."""

    description: str | None = Field(default=None, max_length=500, description="Description of the image")
    image_metadata: dict[str, Any] | None = Field(
        default=None,
        description="Image metadata as a JSON dict",
        sa_column=Column(JSONB),
    )

    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="Image")


class Image(ImageBase, TimeStampMixinBare, SingleParentMixin[MediaParentType], table=True):
    """Database model for images stored in the local file system, using FastAPI-Storages."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    filename: str = Field(description="Original file name of the image. Automatically generated.", nullable=False)
    file: ImageType = Field(
        sa_column=Column(ImageType, nullable=False),
        description="Local file path to the image",
    )

    parent_type: MediaParentType = Field(
        sa_column=Column(SAEnum(MediaParentType, name="imageparenttype"), nullable=False),
        description=SingleParentMixin.get_parent_type_description(MediaParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")
    material_id: int | None = Field(default=None, foreign_key="material.id")
    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")

    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)


### Video Model ###
class VideoBase(CustomBase):
    """Base model for videos stored online."""

    url: str = Field(description="URL linking to the video", nullable=False)
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(
        default=None,
        description="Video metadata as a JSON dict",
        sa_column=Column(JSONB),
    )


class Video(VideoBase, IntPrimaryKeyMixin, TimeStampMixinBare, table=True):
    """Database model for videos stored online."""

    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", nullable=False)
