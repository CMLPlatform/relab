"""Database models for file storage."""

import uuid
from enum import StrEnum
from typing import Any  # noqa: TC003 # Used at runtime for ORM mapped annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.file_storage.models.storage_core import StorageFile, StorageImage
from app.api.file_storage.models.storage_types import FileType, ImageType


class MediaParentType(StrEnum):
    """Parent entity types that can own files and images."""

    PRODUCT = "product"
    PRODUCT_TYPE = "product_type"
    MATERIAL = "material"


class File(TimeStampMixinBare, Base):
    """Database model for generic files stored in the local file system."""

    __tablename__ = "file"
    __table_args__ = (
        CheckConstraint("upload_size_bytes >= 0", name="ck_file_upload_size_bytes_non_negative"),
        Index("ix_file_parent_type_parent_id", "parent_type", "parent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(doc="Original file name of the file.")
    file: Mapped[StorageFile] = mapped_column(FileType, nullable=False, doc="Local file path to the file")
    upload_size_bytes: Mapped[int] = mapped_column(default=0, server_default="0")
    description: Mapped[str | None] = mapped_column(default=None)
    parent_type: Mapped[MediaParentType] = mapped_column(SAEnum(MediaParentType, name="fileparenttype"), nullable=False)
    parent_id: Mapped[int] = mapped_column(nullable=False)


class Image(TimeStampMixinBare, Base):
    """Database model for images stored in the local file system."""

    __tablename__ = "image"
    __table_args__ = (
        CheckConstraint("upload_size_bytes >= 0", name="ck_image_upload_size_bytes_non_negative"),
        CheckConstraint(
            "(width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)",
            name="ck_image_dimensions_positive",
        ),
        # created_at is the third column so Product.first_image_file — which picks the
        # oldest image of one parent — reads a single index entry instead of scanning
        # the parent's images and sorting them.
        Index("ix_image_parent_type_parent_id_created_at", "parent_type", "parent_id", "created_at"),
        # The stats series buckets product images by period; the partial index keeps
        # it off the other parent types entirely.
        Index("ix_image_product_created_at", "created_at", postgresql_where=text("parent_type = 'PRODUCT'")),
        Index(
            "image_filename_trgm_idx", "filename", postgresql_using="gin", postgresql_ops={"filename": "gin_trgm_ops"}
        ),
        Index(
            "image_description_trgm_idx",
            "description",
            postgresql_using="gin",
            postgresql_ops={"description": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(nullable=False, doc="Original file name of the image.")
    file: Mapped[StorageImage] = mapped_column(ImageType, nullable=False, doc="Local file path to the image")
    upload_size_bytes: Mapped[int] = mapped_column(default=0, server_default="0")
    # Nullable, and stay that way: rows written before dimensions were recorded
    # keep NULL until the backfill reaches them, and a failed decode leaves them
    # unset rather than blocking the upload. Measured after EXIF rotation, so
    # they describe the file as stored.
    width_px: Mapped[int | None] = mapped_column(default=None, doc="Pixel width of the stored image.")
    height_px: Mapped[int | None] = mapped_column(default=None, doc="Pixel height of the stored image.")
    description: Mapped[str | None] = mapped_column(default=None)
    image_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    parent_type: Mapped[MediaParentType] = mapped_column(
        SAEnum(MediaParentType, name="imageparenttype"), nullable=False
    )
    parent_id: Mapped[int] = mapped_column(nullable=False)


class Video(TimeStampMixinBare, Base):
    """Database model for videos stored online."""

    __tablename__ = "video"
    __table_args__ = (Index("ix_video_product_id", "product_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(nullable=False, doc="URL linking to the video")
    title: Mapped[str | None] = mapped_column(default=None)
    description: Mapped[str | None] = mapped_column(default=None)
    video_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), nullable=False)
