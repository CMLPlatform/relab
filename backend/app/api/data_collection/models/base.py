"""Base model classes for data collection; split out to avoid circular imports.

These classes have no heavy ORM dependencies (no relationships, foreign keys, or
other model imports) and can therefore be imported by common/schemas/base.py
without triggering the full data_collection/models.py import chain.
"""

from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, computed_field
from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.validation import normalize_user_text


def _normalize_brand_text(value: object) -> object:
    """Strip and lowercase product brand input before text validation."""
    if isinstance(value, str):
        return value.strip().lower() or None
    return value


def _validate_brand_text(value: str | None) -> str | None:
    if value is None:
        return None
    return normalize_user_text(value)


NormalizedBrandText = Annotated[
    str | None,
    BeforeValidator(_normalize_brand_text),
    AfterValidator(_validate_brand_text),
]


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


