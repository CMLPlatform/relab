"""Main Pydantic models used to validate input and output data."""

from pydantic import Field, PositiveInt

from app.api.common.models.associations import MaterialProductLinkBase
from app.api.common.models.enums import Unit
from app.api.common.schemas.base import (
    AssociationModelReadSchemaWithTimeStamp,
    BaseCreateSchema,
    BaseUpdateSchema,
    MaterialRead,
    ProductRead,
)

### Material-Product Association Schemas ###


class MaterialProductLinkCreateWithinProductAndMaterial(BaseCreateSchema, MaterialProductLinkBase):
    """Schema for creating material-product links from the product side, with an external material ID."""


class MaterialProductLinkCreateWithinProduct(BaseCreateSchema, MaterialProductLinkBase):
    """Schema for creating material-product links from the product side."""

    material_id: PositiveInt = Field(description="ID of the material in the product")


class MaterialProductLinkReadWithinProduct(AssociationModelReadSchemaWithTimeStamp, MaterialProductLinkBase):
    """Schema for reading material-product links from the product side."""

    material_id: PositiveInt
    material: MaterialRead


class MaterialProductLinkReadWithinMaterial(AssociationModelReadSchemaWithTimeStamp, MaterialProductLinkBase):
    """Schema for reading material-product links from the material side."""

    product_id: PositiveInt
    product: ProductRead


class MaterialProductLinkUpdate(BaseUpdateSchema):
    """Schema for updating material-product links."""

    quantity: float | None = Field(gt=0)
    unit: Unit | None = Field(default=Unit.KILOGRAM)
