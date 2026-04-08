"""Linking tables for cross-module many-to-many relationships."""

from pydantic import BaseModel, Field
from sqlalchemy import Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.models.enums import Unit


### Pydantic base schema (shared with schemas/associations.py) ###
class MaterialProductLinkBaseSchema(BaseModel):
    """Base schema for Material-Product links. Used by Pydantic schemas only, not ORM."""

    quantity: float = Field(gt=0, description="Quantity of the material in the product")
    unit: Unit = Field(
        default=Unit.KILOGRAM,
        description=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )


### ORM Mixin ###
class MaterialProductLinkBase:
    """ORM mixin for Material-Product links."""

    quantity: Mapped[float] = mapped_column(doc="Quantity of the material in the product")
    unit: Mapped[Unit] = mapped_column(
        Enum(Unit),
        default=Unit.KILOGRAM,
        doc=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )
