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

from app.api.background_data.models import MaterialBase
from app.api.common.models.base import TimeStampMixinBare
from app.api.data_collection.models import ProductBase


### Common Validation ###
def serialize_datetime_with_z(dt: datetime) -> str:
    """Serialize datetime to ISO 8601 format with 'Z' timezone."""
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


### Base Schemas ###
class BaseCreateSchema(BaseModel):
    """Base schema for all create operations."""

    model_config = ConfigDict(
        extra="forbid",  # Prevent additional fields not in schema
        str_strip_whitespace=True,  # Strip whitespace from strings
    )


class BaseReadSchema(BaseModel):
    """Base schema for all read operations."""

    id: PositiveInt | UUID4


class BaseReadSchemaWithTimeStampBare(TimeStampMixinBare):
    """Bare Timestamp reading mixin."""

    @field_serializer("created_at", "updated_at", when_used="unless-none")
    def serialize_timestamps(self, dt: datetime, _info: FieldSerializationInfo) -> str:
        """Serialize timestamps for read operations."""
        return serialize_datetime_with_z(dt)


class BaseReadSchemaWithTimeStamp(BaseReadSchema, BaseReadSchemaWithTimeStampBare):
    """Base schema for all read operations, including timestamps."""


class AssociationModelReadSchemaWithTimeStamp(BaseModel, BaseReadSchemaWithTimeStampBare):
    """Base schema for all read operations on association models, including timestamps.

    Association models don't have a separate primary key, so the id field is excluded
    """


class BaseUpdateSchema(BaseModel):
    """Base schema for all update operations."""

    model_config = ConfigDict(
        extra="forbid",  # Prevent additional fields not in schema
        str_strip_whitespace=True,  # Strip whitespace from strings
    )


### Base Schemas to avoid Circular Dependencies ###
# These are defined in the same file to avoid circular dependencies with other schemas


## Material Schemas ##
class MaterialRead(BaseReadSchema, MaterialBase):
    """Schema for reading material information."""


## Product Schemas ##
class ProductRead(BaseReadSchemaWithTimeStamp, ProductBase):
    """Base schema for reading product information."""

    product_type_id: PositiveInt | None = None
    owner_id: UUID4

    # HACK: Include parent id and mount_in_parent in base product read schema
    # TODO: separate components and base products on the model level
    parent_id: PositiveInt | None = None
    amount_in_parent: float | None = Field(default=None, description="Quantity within parent product")

    @field_serializer("dismantling_time_start", "dismantling_time_end", when_used="unless-none")
    def serialize_timestamps(self, dt: datetime, _info: FieldSerializationInfo) -> str:
        """Serialize timestamps for read operations."""
        return serialize_datetime_with_z(dt)


class ComponentRead(ProductRead):
    """Base schema for reading component information."""

    parent_id: PositiveInt | None = None
    amount_in_parent: float | None = Field(default=None, description="Quantity within parent product")
