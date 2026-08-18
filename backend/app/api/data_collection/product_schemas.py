"""Product read schemas, split out so reference_data can import them.

``data_collection/schemas.py`` imports ``reference_data.schemas``, so the
product schemas that reference_data needs (for material→product links) live in
this leaf module instead. It imports only ``common`` and ``core``.
"""

from typing import Any, Self

from pydantic import UUID4, BaseModel, Field, PositiveInt, model_validator

from app.api.common.schemas.base import IntIdReadSchemaWithTimeStamp
from app.api.common.schemas.field_mixins import PhysicalPropertiesFields, ProductCircularityPropertiesFields
from app.core.config import settings
from app.core.images.urls import build_thumbnail_url, build_thumbnail_urls_for


class ProductFields(BaseModel):
    """Shared product fields for API schemas."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)


class ThumbnailFields(BaseModel):
    """Shared thumbnail-derivation fields for any read schema that shows a product image."""

    thumbnail_url: str | None = None
    thumbnail_urls: dict[int, str] = Field(
        default_factory=dict,
        description=(
            "Pre-computed thumbnail URLs keyed by width in pixels. Only widths that exist for this "
            "image are present: narrower originals yield fewer entries. Pick the width you render "
            "at rather than scaling `thumbnail_url`, which is always the smallest, list-sized one."
        ),
    )
    # Sourced from the Product.first_image_file column property so summary reads
    # carry a thumbnail without loading the images relationship.
    first_image_file: Any = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def _derive_thumbnail_url(self) -> Self:
        """Derive the thumbnail URL and its wider siblings from the earliest image."""
        if self.thumbnail_url is None:
            self.thumbnail_url = build_thumbnail_url(self.first_image_file, settings.image_storage_path)
        if not self.thumbnail_urls:
            self.thumbnail_urls = build_thumbnail_urls_for(self.first_image_file, settings.image_storage_path)
        return self


class ProductReadBase(
    IntIdReadSchemaWithTimeStamp,
    ProductFields,
    PhysicalPropertiesFields,
    ProductCircularityPropertiesFields,
    ThumbnailFields,
):
    """Shared read fields for base products and components."""

    product_type_id: PositiveInt | None = None


class ProductRead(ProductReadBase):
    """Read schema for base products (top of a product tree)."""

    owner_id: UUID4 | None = None
    owner_username: str | None = None


class ProductSummary(IntIdReadSchemaWithTimeStamp, ThumbnailFields):
    """Minimal product summary for embedding in unrelated contexts (e.g. material links).

    Deliberately narrower than ``ProductRead`` — no owner, physical/circularity
    properties, or other detail-view fields since no consumer needs them here.
    Extend with more fields only when an actual caller needs them.
    """

    name: str
