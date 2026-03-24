"""Database models for files, images and videos."""

import uuid
from enum import StrEnum
from functools import cached_property
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

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
    UUIDPrimaryKeyMixin,
)
from app.api.file_storage.models.custom_types import FileType, ImageType
from app.core.config import settings

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

    # Class variables
    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="File")


class File(FileBase, UUIDPrimaryKeyMixin, TimeStampMixinBare, SingleParentMixin[MediaParentType], table=True):
    """Database model for generic files stored in the local file system, using FastAPI-Storages."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    filename: str = Field(description="Original file name of the file. Automatically generated.")

    # TODO: Add custom file paths based on parent object (Product, year, etc.)
    file: FileType = Field(sa_column=Column(FileType, nullable=False), description="Local file path to the file")

    # Many-to-one relationships. This is ugly but SQLModel does not play well with polymorphic associations.
    # TODO: Implement improved polymorphic associations in SQLModel after this issue is resolved: https://github.com/fastapi/sqlmodel/pull/1226

    parent_type: MediaParentType = Field(
        sa_column=Column(SAEnum(MediaParentType, name="fileparenttype"), nullable=False),
        description=SingleParentMixin.get_parent_type_description(MediaParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")

    material_id: int | None = Field(default=None, foreign_key="material.id")

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")

    # Model configuration
    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True, use_enum_values=True)

    @property
    def file_exists(self) -> bool:
        """Return True if the underlying file exists in storage."""
        return self.file is not None and Path(self.file.path).exists()

    @cached_property
    def file_url(self) -> str | None:
        """Return the URL to the file, or None if the file is missing from storage."""
        if self.file and Path(self.file.path).exists():
            relative_path: Path = Path(self.file.path).relative_to(settings.file_storage_path)
            return f"/uploads/files/{quote(str(relative_path))}"
        return None


### Image Model ###


class ImageBase(CustomBase):
    """Base model for images stored in the local file system."""

    description: str | None = Field(default=None, max_length=500, description="Description of the image")
    image_metadata: dict[str, Any] | None = Field(
        default=None, description="Image metadata as a JSON dict", sa_column=Column(JSONB)
    )

    # Class variables
    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="Image")


class Image(ImageBase, UUIDPrimaryKeyMixin, TimeStampMixinBare, SingleParentMixin[MediaParentType], table=True):
    """Database model for images stored in the local file system, using FastAPI-Storages."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    # TODO: To avoid this hack, for all database models, create a InDB child class that has non-optional id field
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    filename: str = Field(description="Original file name of the image. Automatically generated.", nullable=False)
    file: ImageType = Field(
        sa_column=Column(ImageType, nullable=False),
        description="Local file path to the image",
    )

    # Many-to-one relationships. This is ugly but SQLModel does not play well with polymorphic associations.
    parent_type: MediaParentType = Field(
        sa_column=Column(SAEnum(MediaParentType, name="imageparenttype"), nullable=False),
        description=SingleParentMixin.get_parent_type_description(MediaParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")

    material_id: int | None = Field(default=None, foreign_key="material.id")

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")

    # Model configuration
    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)

    @property
    def file_exists(self) -> bool:
        """Return True if the underlying image file exists in storage."""
        return self.file is not None and Path(self.file.path).exists()

    @cached_property
    def image_url(self) -> str | None:
        """Return the URL to the image file, or None if the file is missing from storage."""
        if self.file and Path(self.file.path).exists():
            relative_path = Path(self.file.path).relative_to(settings.image_storage_path)
            return f"/uploads/images/{quote(str(relative_path))}"
        return None

    @property
    def thumbnail_url(self) -> str | None:
        """Return the URL to a default-sized thumbnail of the image, or None if no file is stored."""
        if self.file:
            return f"/images/{self.id}/resized?width=200"
        return None


### Video Model ###
# Note: Video intentionally only supports Product as its parent (no Material or ProductType).
# Videos are data-collection artifacts tied to dismantling sessions, not reference data.
class VideoBase(CustomBase):
    """Base model for videos stored online."""

    url: str = Field(description="URL linking to the video", nullable=False)
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(
        default=None, description="Video metadata as a JSON dict", sa_column=Column(JSONB)
    )


class Video(VideoBase, IntPrimaryKeyMixin, TimeStampMixinBare, table=True):
    """Database model for videos stored online."""

    id: int | None = Field(default=None, primary_key=True)

    # Many-to-one relationships
    product_id: int = Field(foreign_key="product.id", nullable=False)
