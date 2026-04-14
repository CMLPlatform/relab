"""Base schemas for the application."""

from datetime import UTC, datetime

from pydantic import (
    UUID4,
    BaseModel,
    ConfigDict,
    Field,
    FieldSerializationInfo,
    PositiveInt,
    field_serializer,
)

from app.api.common.schemas.field_mixins import (
    CircularityPropertiesFields,
    MaterialFields,
    PhysicalPropertiesFields,
    ProductFields,
)


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

    id: PositiveInt  # type: ignore[assignment]


class UUIDIdReadSchema(BaseReadSchema):
    """Read schema for models with UUID primary keys."""

    id: UUID4  # type: ignore[assignment]


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


### Base Schemas to avoid Circular Dependencies ###
# These are defined in the same file to avoid circular dependencies with other schemas


## Material Schemas ##
class MaterialRead(IntIdReadSchema, MaterialFields):
    """Schema for reading material information."""


## Product Schemas ##
class ProductRead(IntIdReadSchemaWithTimeStamp, ProductFields, PhysicalPropertiesFields, CircularityPropertiesFields):
    """Base schema for reading product information."""

    product_type_id: PositiveInt | None = None
    owner_id: UUID4 | None = None
    owner_username: str | None = None

    thumbnail_url: str | None = None

    # Include component metadata here because the same read schema serves both base products and components.
    # TODO: separate components and base products on the model level
    parent_id: PositiveInt | None = None
    amount_in_parent: int | None = Field(default=None, description="Quantity within parent product")

    @field_serializer("dismantling_time_start", "dismantling_time_end", when_used="unless-none")
    def serialize_timestamps(self, dt: datetime, _info: FieldSerializationInfo) -> str:
        """Serialize timestamps for read operations."""
        return serialize_datetime_with_z(dt)


class ComponentRead(ProductRead):
    """Base schema for reading component information."""
