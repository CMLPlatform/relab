"""Pydantic models used to validate CRUD operations for data collection data."""

import logging
from typing import TYPE_CHECKING, Annotated, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PositiveInt,
    model_validator,
)

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
from app.api.data_collection.models.base import ProductBase
from app.api.file_storage.schemas import (
    FileRead,
    ImageRead,
    VideoCreateWithinProduct,
    VideoReadWithinProduct,
)
from app.api.reference_data.schemas import ProductTypeRead

if TYPE_CHECKING:
    from collections.abc import Collection


logger = logging.getLogger(__name__)


# Normalizes brand strings: strips whitespace and lowercases; empty string becomes None
NormalizedBrand = Annotated[
    str | None,
    BeforeValidator(lambda v: v.strip().lower() or None if isinstance(v, str) else v),
]


### Product Schemas ###


## Utility functions ##
def validate_material_or_components(bill_of_materials: Collection, components: Collection) -> None:
    """Validation logic to ensure either materials or components are provided."""
    if len(bill_of_materials) == 0 and len(components) == 0:
        err_msg = "Product must have at least one material or component"
        # TODO: raise error again once we implement mBill of materials UI
        # that allows users to add materials at product creation instead of only components
        logger.warning("Validation warning: %s. This will become an error in the future.", err_msg)


## Create Schemas ##
class ProductCreateBase(BaseCreateSchema, ProductBase):
    """Base schema for product and component creation."""

    brand: NormalizedBrand = Field(default=None, max_length=100)


class ProductCreateWithRelationships(ProductCreateBase):
    """Schema for creating a product or component with relationships to other models."""

    product_type_id: PositiveInt | None = None

    bill_of_materials: list[MaterialProductLinkCreateWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )


class ProductCreateBaseProduct(ProductCreateWithRelationships):
    """Schema for creating a base product."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": PRODUCT_CREATE_EXAMPLES})
    videos: list[VideoCreateWithinProduct] = Field(default_factory=list, description="Disassembly videos")


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


class ProductFacetValue(BaseModel):
    """One derived product facet option and its result count."""

    value: str
    count: int


ProductFacetsRead = dict[str, list[ProductFacetValue]]


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
    """Schema for reading a base product with all relationships."""

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


class ComponentReadWithRelationships(ComponentRead):
    """Schema for reading a component with all relationships."""

    product_type: ProductTypeRead | None = None
    images: list[ImageRead] = Field(default_factory=list, description="Product images")
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
    """Base-product detail schema with one level of child components."""

    components: list[ComponentRead] = Field(default_factory=list, description="List of component products")


class ComponentReadWithRelationshipsAndFlatComponents(ComponentReadWithRelationships):
    """Component detail schema with one level of child components."""

    components: list[ComponentRead] = Field(default_factory=list, description="List of sub-components")


class ComponentReadWithRecursiveComponents(ComponentRead):
    """Component read schema with recursive sub-components."""

    components: list[ComponentReadWithRecursiveComponents] = Field(
        default_factory=list, description="List of component products"
    )


# Rebuild schema to allow for nested components
ComponentReadWithRecursiveComponents.model_rebuild()


### Update Schemas ###
class ProductUpdate(BaseUpdateSchema):
    """Schema for updating product information including physical and circularity properties."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: NormalizedBrand = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)

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
