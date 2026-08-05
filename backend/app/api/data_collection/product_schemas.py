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
from app.core.images.urls import build_thumbnail_url


class ProductFields(BaseModel):
    """Shared product fields for API schemas."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)


class ProductReadBase(
    IntIdReadSchemaWithTimeStamp, ProductFields, PhysicalPropertiesFields, ProductCircularityPropertiesFields
):
    """Shared read fields for base products and components."""

    product_type_id: PositiveInt | None = None
    thumbnail_url: str | None = None
    # Sourced from the Product.first_image_file column property so summary reads
    # carry a thumbnail without loading the images relationship.
    first_image_file: Any = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def _derive_thumbnail_url(self) -> Self:
        """Derive the thumbnail URL from the earliest image when not supplied."""
        if self.thumbnail_url is None:
            self.thumbnail_url = build_thumbnail_url(self.first_image_file, settings.image_storage_path)
        return self


class ProductRead(ProductReadBase):
    """Read schema for base products (top of a product tree)."""

    owner_id: UUID4 | None = None
    owner_username: str | None = None
