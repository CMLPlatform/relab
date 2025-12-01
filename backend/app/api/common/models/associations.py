"""Linking tables for cross-module many-to-many relationships."""

from typing import TYPE_CHECKING

from sqlmodel import Column, Enum, Field, Relationship

from app.api.common.models.base import CustomLinkingModelBase, TimeStampMixinBare
from app.api.common.models.enums import Unit

if TYPE_CHECKING:
    from app.api.background_data.models import Material
    from app.api.data_collection.models import Product


### Material-Product Association Models ###
class MaterialProductLinkBase(CustomLinkingModelBase):
    """Base model for Material-Product links."""

    quantity: float = Field(gt=0, description="Quantity of the material in the product")
    unit: Unit = Field(
        default=Unit.KILOGRAM,
        sa_column=Column(Enum(Unit)),
        description=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )


class MaterialProductLink(MaterialProductLinkBase, TimeStampMixinBare, table=True):
    """Association table to link Material with Product."""

    material_id: int = Field(
        foreign_key="material.id", primary_key=True, description="ID of the material in the product"
    )
    product_id: int = Field(
        foreign_key="product.id", primary_key=True, description="ID of the product with the material"
    )

    material: Material = Relationship(back_populates="product_links", sa_relationship_kwargs={"lazy": "selectin"})
    product: Product = Relationship(back_populates="bill_of_materials", sa_relationship_kwargs={"lazy": "selectin"})

    def __str__(self) -> str:
        return f"{self.quantity} {self.unit} of {self.material.name} in {self.product.name}"
