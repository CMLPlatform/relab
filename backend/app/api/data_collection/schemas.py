"""Pydantic models used to validate CRUD operations for data collection data."""

from collections.abc import Collection
from datetime import UTC, datetime, timedelta
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    ConfigDict,
    Field,
    PastDatetime,
    PositiveInt,
    model_validator,
)

from app.api.background_data.schemas import ProductTypeRead
from app.api.common.schemas.associations import (
    MaterialProductLinkCreateWithinProduct,
    MaterialProductLinkReadWithinProduct,
)
from app.api.common.schemas.base import (
    BaseCreateSchema,
    BaseReadSchemaWithTimeStamp,
    BaseUpdateSchema,
    ComponentRead,
    ProductRead,
)
from app.api.data_collection.models import (
    PhysicalPropertiesBase,
    ProductBase,
)
from app.api.file_storage.schemas import (
    FileRead,
    ImageRead,
    VideoCreateWithinProduct,
    VideoReadWithinProduct,
)

### Constants ###


MAX_TIMESTAMP_AGE: timedelta = timedelta(days=365)


### Common Validators ###
def not_too_old(dt: datetime, time_delta: timedelta = MAX_TIMESTAMP_AGE) -> datetime:
    """Ensure datetime is not older than time_delta."""
    if dt and dt < datetime.now(UTC) - time_delta:
        err_msg: str = f"Timestamp cannot be more than {time_delta.days} days in past: {dt:%Y-%m-%d %H:%M}"
        raise ValueError(err_msg)
    return dt


def ensure_timezone(dt: datetime) -> AwareDatetime:
    """Ensure datetime has timezone."""
    if dt and not dt.tzinfo:
        err_msg: str = "Datetime must have timezone info"
        raise ValueError(err_msg)
    return dt


# Pydantic Type to ensure datetime is in the past and timezone-aware and not too far in the past
ValidDateTime = Annotated[
    PastDatetime,
    AfterValidator(ensure_timezone),
    AfterValidator(not_too_old),
]


### Properties Schemas ###


class PhysicalPropertiesCreate(BaseCreateSchema, PhysicalPropertiesBase):
    """Schema for creating physical properties."""

    model_config: ConfigDict = ConfigDict(
        json_schema_extra={"examples": [{"weight_kg": 20, "height_cm": 150, "width_cm": 70, "depth_cm": 50}]}
    )


class PhysicalPropertiesRead(BaseReadSchemaWithTimeStamp, PhysicalPropertiesBase):
    """Schema for reading physical properties."""

    model_config: ConfigDict = ConfigDict(
        json_schema_extra={"examples": [{"id": 1, "weight_kg": 20, "height_cm": 150, "width_cm": 70, "depth_cm": 50}]}
    )


class PhysicalPropertiesUpdate(BaseUpdateSchema, PhysicalPropertiesBase):
    """Schema for updating physical properties."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": [{"weight_kg": 15, "height_cm": 120}]})


### Product Schemas ###


## Utility functions ##
def validate_material_or_components(bill_of_materials: Collection, components: Collection) -> None:
    """Validation logic to ensure either materials or components are provided."""
    if len(bill_of_materials) == 0 and len(components) == 0:
        err_msg = "Product must have at least one material or component"
        raise ValueError(err_msg)


## Create Schemas ##


class ProductCreateBase(BaseCreateSchema, ProductBase):
    """Base schema for product and component creation."""

    # Override base model start and end time to for validation purposes
    dismantling_time_start: ValidDateTime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Start of the dismantling time, in ISO 8601 format with timezone info",
    )
    dismantling_time_end: ValidDateTime | None = Field(
        default=None, description="End of the dismantling time, in ISO 8601 format with timezone info"
    )


class ProductCreateWithRelationships(ProductCreateBase):
    """Schema for creating a product or component with relationships to other models."""

    product_type_id: PositiveInt | None = None

    physical_properties: PhysicalPropertiesCreate | None = Field(
        default=None, description="Physical properties of the product"
    )

    videos: list[VideoCreateWithinProduct] = Field(default_factory=list, description="Disassembly videos")
    bill_of_materials: list[MaterialProductLinkCreateWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )


class ProductCreateBaseProduct(ProductCreateWithRelationships):
    """Schema for creating a base product."""

    model_config: ConfigDict = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Office Chair",
                    "description": "Complete chair assembly",
                    "brand": "Brand 1",
                    "model": "Model 1",
                    "dismantling_time_start": "2025-09-22T14:30:45Z",
                    "dismantling_time_end": "2025-09-22T16:30:45Z",
                    "product_type_id": 1,
                    "physical_properties": {
                        "weight_kg": 20,
                        "height_cm": 150,
                        "width_cm": 70,
                        "depth_cm": 50,
                    },
                    "videos": [
                        {"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}
                    ],
                    "bill_of_materials": [
                        {"quantity": 0.3, "unit": "kg", "material_id": 1},
                        {"quantity": 0.1, "unit": "kg", "material_id": 2},
                    ],
                }
            ]
        }
    )


class ComponentCreate(ProductCreateWithRelationships):
    """Schema for creating a component within an existing product.

    Owner ID and parent ID are inferred from the parent product within the CRUD layer.
    """

    amount_in_parent: int = Field(gt=0, description="Quantity within parent product. Required for component products.")


# Recursive product creation schemas
class ComponentCreateWithComponents(ComponentCreate):
    """Schema for creating a component with optional sub-components.

    This schema is used for recursive creation of components with sub-components.

    Owner ID and parent ID are inferred from the parent product within the CRUD layer.
    """

    # Recursive components
    components: list["ComponentCreateWithComponents"] = Field(
        default_factory=list, description="Set of component products"
    )

    @model_validator(mode="after")
    def has_material_or_components(self) -> Self:
        validate_material_or_components(self.bill_of_materials, self.components)
        return self


# Rebuild schema to allow for nested components
ComponentCreateWithComponents.model_rebuild()


class ProductCreateWithComponents(ProductCreateBaseProduct):
    """Schema for creating a base product with optional components."""

    components: list[ComponentCreateWithComponents] = Field(
        default_factory=list, description="Set of component products"
    )

    @model_validator(mode="after")
    def has_material_or_components(self) -> Self:
        validate_material_or_components(self.bill_of_materials, self.components)
        return self


### Read Schemas ###
# Note that the base ProductRead schema is imported from app.api.common.schemas.base to avoid circular dependencies


class ProductReadWithProperties(ProductRead):
    """Schema for reading product information with all properties."""

    physical_properties: PhysicalPropertiesRead | None = None


class ProductReadWithRelationships(ProductReadWithProperties):
    """Schema for reading product information with all relationships."""

    product_type: ProductTypeRead | None = None
    images: list[ImageRead] = Field(default_factory=list, description="Product images")
    videos: list[VideoReadWithinProduct] = Field(default_factory=list, description="Disassembly videos")
    files: list[FileRead] = Field(default_factory=list, description="Product files")
    bill_of_materials: list[MaterialProductLinkReadWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )


class ProductReadWithRelationshipsAndFlatComponents(ProductReadWithRelationships):
    """Schema for reading product information with one level of components."""

    components: list["ComponentRead"] = Field(default_factory=list, description="List of component products")


class ComponentReadWithRecursiveComponents(ComponentRead):
    """Schema for reading product information with recursive components."""

    components: list["ComponentReadWithRecursiveComponents"] = Field(
        default_factory=list, description="List of component products"
    )


# Rebuild schema to allow for nested components
ComponentReadWithRecursiveComponents.model_rebuild()


class ProductReadWithRecursiveComponents(ProductReadWithRelationships):
    """Schema for reading product information with recursive components."""

    components: list[ComponentReadWithRecursiveComponents] = Field(
        default_factory=list, description="List of component products"
    )


### Update Schemas ###
class ProductUpdate(BaseUpdateSchema):
    """Schema for updating basic product information."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)

    dismantling_notes: str | None = Field(default=None, max_length=500, description="Notes on the dismantling process")
    dismantling_time_start: ValidDateTime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Start of the dismantling time, in ISO 8601 format with timezone info",
    )
    dismantling_time_end: ValidDateTime | None = Field(
        default=None, description="End of the dismantling time, in ISO 8601 format with timezone info"
    )
    product_type_id: PositiveInt | None = None

    amount_in_parent: int | None = Field(
        default=None, gt=0, description="Quantity within parent product. Required for component products."
    )


class ProductUpdateWithProperties(ProductUpdate):
    """Schema for a partial update of a product with properties."""

    physical_properties: PhysicalPropertiesUpdate | None = None
