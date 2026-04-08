"""Base model classes for data collection; split out to avoid circular imports.

These classes have no heavy ORM dependencies (no relationships, foreign keys, or
other model imports) and can therefore be imported by common/schemas/base.py
without triggering the full data_collection/models.py import chain.
"""

from datetime import UTC, datetime

from pydantic import BaseModel, Field as PydanticField, computed_field

from app.api.common.schemas.field_mixins import CircularityPropertiesFields, PhysicalPropertiesFields
from sqlalchemy import TIMESTAMP, String
from sqlalchemy.orm import Mapped, mapped_column


### Validation Utilities ###
def validate_start_and_end_time(start_time: datetime, end_time: datetime | None) -> None:
    """Validate that end time is after start time if both are set."""
    if start_time and end_time and end_time < start_time:
        err_msg: str = f"End time {end_time:%Y-%m-%d %H:%M} must be after start time {start_time:%Y-%m-%d %H:%M}"
        raise ValueError(err_msg)


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

    # Recyclability
    recyclability_observation: Mapped[str | None] = mapped_column(String(500), default=None)
    recyclability_comment: Mapped[str | None] = mapped_column(String(100), default=None)
    recyclability_reference: Mapped[str | None] = mapped_column(String(100), default=None)

    # Repairability
    repairability_observation: Mapped[str | None] = mapped_column(String(500), default=None)
    repairability_comment: Mapped[str | None] = mapped_column(String(100), default=None)
    repairability_reference: Mapped[str | None] = mapped_column(String(100), default=None)

    # Remanufacturability
    remanufacturability_observation: Mapped[str | None] = mapped_column(String(500), default=None)
    remanufacturability_comment: Mapped[str | None] = mapped_column(String(100), default=None)
    remanufacturability_reference: Mapped[str | None] = mapped_column(String(100), default=None)


### Product Mixin ###
class ProductFieldsMixin(PhysicalPropertiesMixin, CircularityPropertiesMixin):
    """Mixin for product fields shared between Product model and schemas."""

    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    brand: Mapped[str | None] = mapped_column(String(100), default=None)
    model: Mapped[str | None] = mapped_column(String(100), default=None)

    # Dismantling information
    dismantling_notes: Mapped[str | None] = mapped_column(String(500), default=None)
    dismantling_time_start: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    dismantling_time_end: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), default=None)


# Backward compat aliases
PhysicalPropertiesBase = PhysicalPropertiesMixin
CircularityPropertiesBase = CircularityPropertiesMixin


### Pydantic base schema (shared with schemas.py) ###
class ProductBase(PhysicalPropertiesFields, CircularityPropertiesFields, BaseModel):
    """Base schema for Product. Used by Pydantic CREATE schemas, not ORM.

    Includes validation constraints (max_length, gt, min_length) for write operations.
    """

    name: str = PydanticField(min_length=2, max_length=100)
    description: str | None = PydanticField(default=None, max_length=500)
    brand: str | None = PydanticField(default=None, max_length=100)
    model: str | None = PydanticField(default=None, max_length=100)
    dismantling_notes: str | None = PydanticField(default=None, max_length=500)
    dismantling_time_start: datetime = PydanticField(default_factory=lambda: datetime.now(UTC))
    dismantling_time_end: datetime | None = None

    # Physical properties with write-side constraints
    weight_g: float | None = PydanticField(default=None, gt=0)
    height_cm: float | None = PydanticField(default=None, gt=0)
    width_cm: float | None = PydanticField(default=None, gt=0)
    depth_cm: float | None = PydanticField(default=None, gt=0)

    # Circularity properties with write-side constraints
    recyclability_observation: str | None = PydanticField(default=None, max_length=500)
    recyclability_comment: str | None = PydanticField(default=None, max_length=100)
    recyclability_reference: str | None = PydanticField(default=None, max_length=100)
    repairability_observation: str | None = PydanticField(default=None, max_length=500)
    repairability_comment: str | None = PydanticField(default=None, max_length=100)
    repairability_reference: str | None = PydanticField(default=None, max_length=100)
    remanufacturability_observation: str | None = PydanticField(default=None, max_length=500)
    remanufacturability_comment: str | None = PydanticField(default=None, max_length=100)
    remanufacturability_reference: str | None = PydanticField(default=None, max_length=100)
