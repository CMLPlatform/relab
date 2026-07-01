"""Linking tables for cross-module many-to-many relationships."""

from sqlalchemy import Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.models.enums import Unit

MAX_MATERIAL_QUANTITY = 1_000_000


### ORM Mixin ###
class MaterialProductLinkBase:
    """ORM mixin for Material-Product links."""

    quantity: Mapped[float] = mapped_column(doc="Quantity of the material in the product")
    unit: Mapped[Unit] = mapped_column(
        Enum(Unit),
        default=Unit.KILOGRAM,
        doc=f"Unit of the quantity, e.g. {', '.join([u.value for u in Unit][:3])}",
    )
