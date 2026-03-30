"""Linking tables for cross-module many-to-many relationships."""

from sqlmodel import Column, Enum, Field, SQLModel

from app.api.common.models.enums import Unit


### Material-Product Association Models ###
class MaterialProductLinkBase(SQLModel):
    """Base model for Material-Product links."""

    quantity: float = Field(gt=0, description="Quantity of the material in the product")
    unit: Unit = Field(
        default=Unit.KILOGRAM,
        sa_column=Column(Enum(Unit)),
        description=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )
