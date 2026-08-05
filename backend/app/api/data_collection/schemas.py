"""Pydantic models used to validate CRUD operations for data collection data."""

import logging
from typing import TYPE_CHECKING, Self

from pydantic import (
    UUID4,
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    model_validator,
)

from app.api.common.models.enums import Unit
from app.api.common.schemas.base import (
    MAX_MATERIAL_QUANTITY,
    AssociationModelReadSchemaWithTimeStamp,
    BaseCreateSchema,
    BaseUpdateSchema,
    MaterialProductLinkBase,
    ProductRead,
    ProductReadBase,
)
from app.api.common.schemas.field_mixins import (
    PhysicalPropertiesFields,
    ProductCircularityPropertiesInputFields,
)
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.api.data_collection.examples import PRODUCT_CREATE_EXAMPLES
from app.api.data_collection.models.base import NormalizedBrandText
from app.api.file_storage.schemas import (
    FileRead,
    ImageRead,
    VideoCreateWithinProduct,
    VideoReadWithinProduct,
)
from app.api.reference_data.schemas import MaterialRead, ProductTypeRead

if TYPE_CHECKING:
    from collections.abc import Collection


logger = logging.getLogger(__name__)

### Validation utilities ###
MAX_BOM_ENTRIES = 100
MAX_COMPONENTS_PER_LEVEL = 100
MAX_VIDEOS_PER_PRODUCT = 5
MAX_COMPONENT_AMOUNT = 1_000


def validate_material_or_components(bill_of_materials: Collection, components: Collection) -> None:
    """Validation logic to ensure either materials or components are provided."""
    if len(bill_of_materials) == 0 and len(components) == 0:
        err_msg = "Product must have at least one material or component"
        # TODO: raise error again once we implement Bill of materials UI
        # that allows users to add materials at product creation instead of only components
        logger.warning("Validation warning: %s. This will become an error in the future.", err_msg)


class ProductBase(PhysicalPropertiesFields, ProductCircularityPropertiesInputFields, BaseModel):
    """Write-side base for product create schemas."""

    name: SingleLineUserText = Field(min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    brand: NormalizedBrandText = Field(default=None, max_length=100)
    model: SingleLineUserText | None = Field(default=None, max_length=100)
    weight_g: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)


### Component read schema ###


class ComponentRead(ProductReadBase):
    """Read schema for components (nested inside a base product tree)."""

    parent_id: PositiveInt
    amount_in_parent: int = Field(description="Quantity within parent product")
    owner_id: UUID4 | None = None
    owner_username: str | None = None


### Material-product link schemas ###


class MaterialProductLinkCreateWithinProductAndMaterial(BaseCreateSchema, MaterialProductLinkBase):
    """Schema for creating material-product links with an external material ID."""


class MaterialProductLinkCreateWithinProduct(BaseCreateSchema, MaterialProductLinkBase):
    """Schema for creating material-product links from the product side."""

    material_id: PositiveInt = Field(description="ID of the material in the product")


class MaterialProductLinkReadWithinProduct(AssociationModelReadSchemaWithTimeStamp, MaterialProductLinkBase):
    """Schema for reading material-product links from the product side."""

    material_id: PositiveInt
    material: MaterialRead


class MaterialProductLinkUpdate(BaseUpdateSchema):
    """Schema for updating material-product links."""

    quantity: float | None = Field(default=None, gt=0, le=MAX_MATERIAL_QUANTITY)
    unit: Unit | None = Field(default=Unit.KILOGRAM)


### Create Schemas ###
class ProductCreateWithRelationships(BaseCreateSchema, ProductBase):
    """Schema for creating a product or component with relationships to other models."""

    product_type_id: PositiveInt | None = None

    bill_of_materials: list[MaterialProductLinkCreateWithinProduct] = Field(
        default_factory=list,
        max_length=MAX_BOM_ENTRIES,
        description="Bill of materials with quantities and units",
    )


class ProductCreateBaseProduct(ProductCreateWithRelationships):
    """Schema for creating a base product."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": PRODUCT_CREATE_EXAMPLES})
    videos: list[VideoCreateWithinProduct] = Field(
        default_factory=list,
        max_length=MAX_VIDEOS_PER_PRODUCT,
        description="Disassembly videos",
    )


class ComponentCreate(ProductCreateWithRelationships):
    """Schema for creating a component within an existing product.

    Owner ID and parent ID are inferred from the parent product within the CRUD layer.
    """

    amount_in_parent: int = Field(
        gt=0,
        le=MAX_COMPONENT_AMOUNT,
        description="Quantity within parent product. Required for component products.",
    )


# Recursive product creation schemas
class ComponentCreateWithComponents(ComponentCreate):
    """Schema for creating a component with optional sub-components.

    This schema is used for recursive creation of components with sub-components.

    Owner ID and parent ID are inferred from the parent product within the CRUD layer.
    """

    # Recursive components
    components: list[ComponentCreateWithComponents] = Field(
        default_factory=list,
        max_length=MAX_COMPONENTS_PER_LEVEL,
        description="Set of component products",
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
        default_factory=list,
        max_length=MAX_COMPONENTS_PER_LEVEL,
        description="Set of component products",
    )

    @model_validator(mode="after")
    def has_material_or_components(self) -> Self:
        """Validation to ensure product has either materials or components."""
        validate_material_or_components(self.bill_of_materials, self.components)
        return self


### Read Schemas ###


class _MediaRelationships(BaseModel):
    """Shared relationship fields for product/component detail reads.

    ``thumbnail_url`` is derived on ProductReadBase from the ``first_image_file``
    column property, so detail and summary reads agree without loading images.
    """

    product_type: ProductTypeRead | None = None
    images: list[ImageRead] = Field(default_factory=list, description="Product images")
    files: list[FileRead] = Field(default_factory=list, description="Product files")
    bill_of_materials: list[MaterialProductLinkReadWithinProduct] = Field(
        default_factory=list, description="Bill of materials with quantities and units"
    )

    @model_validator(mode="after")
    def _fallback_thumbnail_from_images(self) -> Self:
        """Derive the thumbnail from the loaded images when no stored file was selected.

        ProductReadBase already derives it from ``first_image_file`` for ORM rows;
        this covers models validated from a plain dict (no column property).
        """
        if self.thumbnail_url is None and self.images:
            first_image = self.images[0]
            self.thumbnail_url = first_image.thumbnail_url or first_image.image_url
        return self


class ProductReadWithRelationships(_MediaRelationships, ProductRead):
    """Schema for reading a base product with all relationships."""

    videos: list[VideoReadWithinProduct] = Field(default_factory=list, description="Disassembly videos")


class ComponentReadWithRelationships(_MediaRelationships, ComponentRead):
    """Schema for reading a component with all relationships."""


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
class ProductUpdate(BaseUpdateSchema, ProductCircularityPropertiesInputFields):
    """Schema for updating product information including physical and circularity properties."""

    name: SingleLineUserText | None = Field(default=None, min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    brand: NormalizedBrandText = Field(default=None, max_length=100)
    model: SingleLineUserText | None = Field(default=None, max_length=100)

    product_type_id: PositiveInt | None = None

    amount_in_parent: int | None = Field(
        default=None,
        gt=0,
        le=MAX_COMPONENT_AMOUNT,
        description="Quantity within parent product. Required for component products.",
    )

    # Physical properties
    weight_g: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)
