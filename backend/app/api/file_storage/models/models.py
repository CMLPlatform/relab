"""Database models for files, images and videos."""

import uuid
from enum import Enum
from functools import cached_property
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar
from urllib.parse import quote

from markupsafe import Markup
from pydantic import UUID4, ConfigDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Relationship
from sqlmodel import Enum as SAEnum

from app.api.common.models.base import APIModelName, CustomBase, SingleParentMixin, TimeStampMixinBare
from app.api.data_collection.models import Product
from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.api.file_storage.models.custom_types import FileType, ImageType
from app.core.config import settings

if TYPE_CHECKING:
    from app.api.background_data.models import Material, ProductType


### Constants ###
PLACEHOLDER_IMAGE_PATH: Path = settings.static_files_path / "images " / "placeholder.png"


### File Model ###
class FileParentType(Enum):
    """Enumeration of types that can have files."""

    PRODUCT = "product"
    PRODUCT_TYPE = "product_type"
    MATERIAL = "material"


class FileBase(CustomBase):
    """Base model for generic files stored in the local file system."""

    description: str | None = Field(default=None, max_length=500, description="Description of the file")

    # Class variables
    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="File")


class File(FileBase, TimeStampMixinBare, SingleParentMixin[FileParentType], table=True):
    """Database model for generic files stored in the local file system, using FastAPI-Storages."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    filename: str = Field(description="Original file name of the file. Automatically generated.")

    # TODO: Add custom file paths based on parent object (Product, year, etc.)
    file: FileType = Field(sa_column=Column(FileType, nullable=False), description="Local file path to the file")

    # Many-to-one relationships. This is ugly but SQLModel does not play well with polymorphic associations.
    # TODO: Implement improved polymorphic associations in SQLModel after this issue is resolved: https://github.com/fastapi/sqlmodel/pull/1226

    parent_type: FileParentType = Field(
        sa_column=Column(SAEnum(FileParentType), nullable=False),
        description=SingleParentMixin.get_parent_type_description(FileParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")
    product: "Product" = Relationship(back_populates="files")

    material_id: int | None = Field(default=None, foreign_key="material.id")
    material: "Material" = Relationship(back_populates="files")

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")
    product_type: "ProductType" = Relationship(back_populates="files")

    # Model configuration
    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True, use_enum_values=True)  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855

    @cached_property
    def file_url(self) -> str:
        """Return the URL to the file."""
        if self.file and Path(self.file.path).exists():
            relative_path: Path = Path(self.file.path).relative_to(settings.file_storage_path)
            return f"/uploads/files/{quote(str(relative_path))}"

        raise FastAPIStorageFileNotFoundError(filename=self.filename)


### Image Model ###


class ImageParentType(str, Enum):
    """Enumeration of types that can have images."""

    PRODUCT = "product"
    PRODUCT_TYPE = "product_type"
    MATERIAL = "material"


class ImageBase(CustomBase):
    """Base model for images stored in the local file system."""

    description: str | None = Field(default=None, max_length=500, description="Description of the image")
    image_metadata: dict[str, Any] | None = Field(
        default=None, description="Image metadata as a JSON dict", sa_column=Column(JSONB)
    )

    # Class variables
    api_model_name: ClassVar[APIModelName | None] = APIModelName(name_camel="Image")


class Image(ImageBase, TimeStampMixinBare, SingleParentMixin, table=True):
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
    parent_type: ImageParentType = Field(
        sa_column=Column(SAEnum(ImageParentType), nullable=False),
        description=SingleParentMixin.get_parent_type_description(ImageParentType),
    )

    product_id: int | None = Field(default=None, foreign_key="product.id")
    product: "Product" = Relationship(back_populates="images")

    material_id: int | None = Field(default=None, foreign_key="material.id")
    material: "Material" = Relationship(back_populates="images")

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")
    product_type: "ProductType" = Relationship(back_populates="images")

    # Model configuration
    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855

    @cached_property
    def image_url(self) -> str:
        """Return the URL to the image file or a placeholder if missing."""
        if self.file and Path(self.file.path).exists():
            relative_path = Path(self.file.path).relative_to(settings.image_storage_path)
            return f"/uploads/images/{quote(str(relative_path))}"
        return str(PLACEHOLDER_IMAGE_PATH)

    def image_preview(self, size: int = 100) -> str:
        """HTML preview of the image with a specified size."""
        return Markup('<img src="{}" style="max-height: {}px;">').format(self.image_url, size)


### Video Model ###
class VideoBase(CustomBase):
    """Base model for videos stored online."""

    url: str = Field(description="URL linking to the video", nullable=False)
    title: str | None = Field(default=None, max_length=100, description="Title of the video")
    description: str | None = Field(default=None, max_length=500, description="Description of the video")
    video_metadata: dict[str, Any] | None = Field(
        default=None, description="Video metadata as a JSON dict", sa_column=Column(JSONB)
    )


class Video(VideoBase, TimeStampMixinBare, table=True):
    """Database model for videos stored online."""

    id: int | None = Field(default=None, primary_key=True)

    # Many-to-one relationships
    product_id: int = Field(foreign_key="product.id", nullable=False)
    product: Product = Relationship(back_populates="videos")
