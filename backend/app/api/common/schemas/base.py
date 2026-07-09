"""Base schemas for the application."""

from datetime import UTC, datetime
from typing import Any, Self

from pydantic import (
    UUID4,
    BaseModel,
    ConfigDict,
    Field,
    FieldSerializationInfo,
    PositiveInt,
    field_serializer,
    model_validator,
)

from app.api.common.models.associations import MAX_MATERIAL_QUANTITY
from app.api.common.models.enums import Unit
from app.api.common.schemas.field_mixins import (
    PhysicalPropertiesFields,
    ProductCircularityPropertiesFields,
    ProductFields,
)
from app.core.config import settings
from app.core.images.urls import build_thumbnail_url


### Common Validation ###
def serialize_datetime_with_z(dt: datetime) -> str:
    """Serialize datetime to ISO 8601 format with 'Z' timezone."""
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


### Base Schemas ###
class BaseInputSchema(BaseModel):
    """Shared base for request-body schemas."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BaseCreateSchema(BaseInputSchema):
    """Base schema for all create operations."""


class BaseReadSchema(BaseModel):
    """Base schema for all read operations.

    Subclasses MUST narrow the ``id`` type to either ``PositiveInt`` or
    ``UUID4`` so the OpenAPI spec emits the correct JSON-Schema type
    (``integer`` vs ``string``).  The union kept here is only a fallback.
    """

    model_config = ConfigDict(from_attributes=True)

    id: PositiveInt | UUID4


class IntIdReadSchema(BaseReadSchema):
    """Read schema for models with integer primary keys."""

    id: PositiveInt


class UUIDIdReadSchema(BaseReadSchema):
    """Read schema for models with UUID primary keys."""

    id: UUID4


class TimestampReadSchemaMixin(BaseModel):
    """Shared timestamp fields for read schemas."""

    model_config = ConfigDict(from_attributes=True)

    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_serializer("created_at", "updated_at", when_used="unless-none")
    def serialize_timestamps(self, dt: datetime, _info: FieldSerializationInfo) -> str:
        """Serialize timestamps for read operations."""
        return serialize_datetime_with_z(dt)


class BaseReadSchemaWithTimeStamp(BaseReadSchema, TimestampReadSchemaMixin):
    """Base schema for all read operations, including timestamps."""


class IntIdReadSchemaWithTimeStamp(IntIdReadSchema, TimestampReadSchemaMixin):
    """Read schema for integer-PK models with timestamps."""


class UUIDIdReadSchemaWithTimeStamp(UUIDIdReadSchema, TimestampReadSchemaMixin):
    """Read schema for UUID-PK models with timestamps."""


class AssociationModelReadSchemaWithTimeStamp(TimestampReadSchemaMixin):
    """Base schema for all read operations on association models, including timestamps.

    Association models don't have a separate primary key, so the id field is excluded
    """


class BaseUpdateSchema(BaseInputSchema):
    """Base schema for all update operations."""


class MaterialProductLinkBase(BaseModel):
    """Pydantic base for material-product link schemas (shared by data_collection and reference_data)."""

    quantity: float = Field(gt=0, le=MAX_MATERIAL_QUANTITY, description="Quantity of the material in the product")
    unit: Unit = Field(
        default=Unit.KILOGRAM,
        description=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )


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


# This schema stays in common (not data_collection) — reference_data needs ProductRead for
# MaterialProductLinkReadWithinMaterial, and data_collection→reference_data already,
# so moving it there would be circular.
class ProductRead(ProductReadBase):
    """Read schema for base products (top of a product tree)."""

    owner_id: UUID4 | None = None
    owner_username: str | None = None
