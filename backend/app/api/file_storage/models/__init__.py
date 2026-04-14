"""Database models for file storage."""

import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.file_storage.models.storage import FileType, ImageType


### Pydantic base schemas (shared with schemas.py) ###
class FileBase(BaseModel):
    """Base schema for File. Used by Pydantic schemas only, not ORM."""

    description: str | None = None


class ImageBase(BaseModel):
    """Base schema for Image. Used by Pydantic schemas only, not ORM."""

    description: str | None = None
    image_metadata: dict[str, Any] | None = None


class VideoBase(BaseModel):
    """Base schema for Video. Used by Pydantic schemas only, not ORM."""

    url: str
    title: str | None = None
    description: str | None = None
    video_metadata: dict[str, Any] | None = None


class MediaParentType(StrEnum):
    """Parent entity types that can own files and images."""

    PRODUCT = "product"
    PRODUCT_TYPE = "product_type"
    MATERIAL = "material"


class File(TimeStampMixinBare, Base):
    """Database model for generic files stored in the local file system."""

    __tablename__ = "file"
    __table_args__ = (Index("ix_file_parent_type_parent_id", "parent_type", "parent_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(doc="Original file name of the file.")
    file: Mapped[Any] = mapped_column(FileType, nullable=False, doc="Local file path to the file")
    description: Mapped[str | None] = mapped_column(default=None)

    parent_type: Mapped[MediaParentType] = mapped_column(SAEnum(MediaParentType, name="fileparenttype"), nullable=False)
    parent_id: Mapped[int] = mapped_column(nullable=False)


class Image(TimeStampMixinBare, Base):
    """Database model for images stored in the local file system."""

    __tablename__ = "image"
    __table_args__ = (Index("ix_image_parent_type_parent_id", "parent_type", "parent_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(nullable=False, doc="Original file name of the image.")
    file: Mapped[Any] = mapped_column(ImageType, nullable=False, doc="Local file path to the image")
    description: Mapped[str | None] = mapped_column(default=None)
    image_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    parent_type: Mapped[MediaParentType] = mapped_column(
        SAEnum(MediaParentType, name="imageparenttype"), nullable=False
    )
    parent_id: Mapped[int] = mapped_column(nullable=False)


class Video(TimeStampMixinBare, Base):
    """Database model for videos stored online."""

    __tablename__ = "video"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(nullable=False, doc="URL linking to the video")
    title: Mapped[str | None] = mapped_column(default=None)
    description: Mapped[str | None] = mapped_column(default=None)
    video_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), nullable=False)
