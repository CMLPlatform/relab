"""Base model classes for data collection; split out to avoid circular imports.

These classes have no heavy ORM dependencies (no relationships, foreign keys, or
other model imports) and can therefore be imported by common/schemas/base.py
without triggering the full data_collection/models.py import chain.
"""

from pydantic import BaseModel, computed_field
from pydantic import Field as PydanticField
from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.schemas.field_mixins import (
    PhysicalPropertiesFields,
    ProductCircularityPropertiesFields,
)


### Properties Mixins ###
class PhysicalPropertiesMixin:
    """Mixin for physical properties of a product."""

    weight_g: Mapped[float | None] = mapped_column(default=None)
    height_cm: Mapped[float | None] = mapped_column(default=None)
    width_cm: Mapped[float | None] = mapped_column(default=None)
    depth_cm: Mapped[float | None] = mapped_column(default=None)

    @computed_field
    @property
    def volume_cm3(self) -> float | None:
        """Calculate the volume of the product."""
        if self.height_cm is None or self.width_cm is None or self.depth_cm is None:
            return None
        return self.height_cm * self.width_cm * self.depth_cm


class CircularityPropertiesMixin:
    """Mixin for circularity properties of a product."""

    circularity_properties: Mapped[dict[str, str | None] | None] = mapped_column(JSONB, default=None)


### Product Mixin ###
class ProductFieldsMixin(PhysicalPropertiesMixin, CircularityPropertiesMixin):
    """Mixin for product fields shared between Product model and schemas."""

    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    brand: Mapped[str | None] = mapped_column(String(100), default=None)
    model: Mapped[str | None] = mapped_column(String(100), default=None)


### Pydantic base schema (shared with schemas.py) ###
class ProductBase(PhysicalPropertiesFields, ProductCircularityPropertiesFields, BaseModel):
    """Base schema for Product. Used by Pydantic CREATE schemas, not ORM.

    Includes validation constraints (max_length, gt, min_length) for write operations.
    """

    name: str = PydanticField(min_length=2, max_length=100)
    description: str | None = PydanticField(default=None, max_length=500)
    brand: str | None = PydanticField(default=None, max_length=100)
    model: str | None = PydanticField(default=None, max_length=100)

    # Physical properties with write-side constraints
    weight_g: float | None = PydanticField(default=None, gt=0)
    height_cm: float | None = PydanticField(default=None, gt=0)
    width_cm: float | None = PydanticField(default=None, gt=0)
    depth_cm: float | None = PydanticField(default=None, gt=0)
