"""Pydantic models used to validate CRUD operations for data collection data."""

import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BeforeValidator,
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
    BaseUpdateSchema,
    ComponentRead,
    ProductRead,
)
from app.api.data_collection.examples import PRODUCT_CREATE_EXAMPLES
from app.api.data_collection.models.base import (
    ProductBase,
    validate_start_and_end_time,
)
from app.api.file_storage.schemas import (
    FileRead,
    ImageRead,
    VideoCreateWithinProduct,
    VideoReadWithinProduct,
)

if TYPE_CHECKING:
    from collections.abc import Collection


logger = logging.getLogger(__name__)

### Constants ###
MAX_TIMESTAMP_AGE: timedelta = timedelta(days=365)

# Normalizes brand strings: strips whitespace and lowercases; empty string becomes None
NormalizedBrand = Annotated[
    str | None,
    BeforeValidator(lambda v: v.strip().lower() or None if isinstance(v, str) else v),
]


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


### Product Schemas ###


## Utility functions ##
def validate_material_or_components(bill_of_materials: Collection, components: Collection) -> None:
    """Validation logic to ensure either materials or components are provided."""
    if len(bill_of_materials) == 0 and len(components) == 0:
        err_msg = "Product must have at least one material or component"
        # TODO: raise error again once we implement mBill of materials UI
        # that allows users to add materials at product creation instead of only components
        # raise ValueError(err_msg) #noqa: ERA001
        logger.warning("Validation warning: %s. This will become an error in the future.", err_msg)


## Create Schemas ##
class ProductCreateBase(BaseCreateSchema, ProductBase):
    """Base schema for product and component creation."""

    brand: NormalizedBrand = Field(default=None, max_length=100)

    # Override base model start and end time to for validation purposes
    dismantling_time_start: ValidDateTime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Start of the dismantling time, in ISO 8601 format with timezone info",
    )
    dismantling_time_end: ValidDateTime | None = Field(
        default=None, description="End of the dismantling time, in ISO 8601 format with timezone info"
    )

    @model_validator(mode="after")
    def validate_times(self) -> Self:
        """Ensure end time is after start time if both are set."""
        validate_start_and_end_time(self.dismantling_time_start, self.dismantling_time_end)
        return self


class ProductCreateWithRelationships(ProductCreateBase):
    """Schema for creating a product or component with relationships to other models."""

    product_type_id: PositiveInt | None = None

    videos: list[VideoCreateWithinProduct] = Field(default_factory=list, description="Disassembly videos")
    bill_of_materials: list[MaterialProductLinkCreateWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )


class ProductCreateBaseProduct(ProductCreateWithRelationships):
    """Schema for creating a base product."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": PRODUCT_CREATE_EXAMPLES})


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
    components: list[ComponentCreateWithComponents] = Field(
        default_factory=list, description="Set of component products"
    )

    @model_validator(mode="after")
    def has_material_or_components(self) -> Self:
        """Validation to ensure product has either materials or components."""
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
        """Validation to ensure product has either materials or components."""
        validate_material_or_components(self.bill_of_materials, self.components)
        return self


### Read Schemas ###
# Note that the base ProductRead schema is imported from app.api.common.schemas.base to avoid circular dependencies


class ProductReadWithRelationships(ProductRead):
    """Schema for reading product information with all relationships."""

    product_type: ProductTypeRead | None = None
    images: list[ImageRead] = Field(default_factory=list, description="Product images")
    videos: list[VideoReadWithinProduct] = Field(default_factory=list, description="Disassembly videos")
    files: list[FileRead] = Field(default_factory=list, description="Product files")
    bill_of_materials: list[MaterialProductLinkReadWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )

    @model_validator(mode="after")
    def populate_thumbnail_url_from_images(self) -> Self:
        """Fill thumbnail_url from the first image when the field is otherwise unset."""
        if self.thumbnail_url is None and self.images:
            self.thumbnail_url = self.images[0].image_url
        return self


class ProductReadWithRelationshipsAndFlatComponents(ProductReadWithRelationships):
    """Schema for reading product information with one level of components."""

    components: list[ComponentRead] = Field(default_factory=list, description="List of component products")


class ComponentReadWithRecursiveComponents(ComponentRead):
    """Schema for reading product information with recursive components."""

    components: list[ComponentReadWithRecursiveComponents] = Field(
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
    """Schema for updating product information including physical and circularity properties."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: NormalizedBrand = Field(default=None, max_length=100)
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

    # Physical properties
    weight_g: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)

    # Circularity properties
    recyclability_observation: str | None = Field(default=None, max_length=500)
    recyclability_comment: str | None = Field(default=None, max_length=100)
    recyclability_reference: str | None = Field(default=None, max_length=100)
    repairability_observation: str | None = Field(default=None, max_length=500)
    repairability_comment: str | None = Field(default=None, max_length=100)
    repairability_reference: str | None = Field(default=None, max_length=100)
    remanufacturability_observation: str | None = Field(default=None, max_length=500)
    remanufacturability_comment: str | None = Field(default=None, max_length=100)
    remanufacturability_reference: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_times(self) -> Self:
        """Ensure end time is after start time if both are set."""
        validate_start_and_end_time(self.dismantling_time_start, self.dismantling_time_end)
        return self
