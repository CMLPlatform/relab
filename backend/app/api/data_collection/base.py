"""Base model classes for data collection; split out to avoid circular imports.

These classes have no heavy ORM dependencies (no relationships, foreign keys, or
other model imports) and can therefore be imported by common/schemas/base.py
without triggering the full data_collection/models.py import chain.
"""

import logging
from datetime import UTC, datetime
from functools import cached_property
from typing import TYPE_CHECKING

from pydantic import computed_field, model_validator
from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field

from app.api.common.models.base import CustomBase

if TYPE_CHECKING:
    from typing import Self

logger = logging.getLogger(__name__)


### Validation Utilities ###
def validate_start_and_end_time(start_time: datetime, end_time: datetime | None) -> None:
    """Validate that end time is after start time if both are set."""
    if start_time and end_time and end_time < start_time:
        err_msg: str = f"End time {end_time:%Y-%m-%d %H:%M} must be after start time {start_time:%Y-%m-%d %H:%M}"
        raise ValueError(err_msg)


### Properties Base Models ###
class PhysicalPropertiesBase(CustomBase):
    """Base model to store physical properties of a product."""

    weight_g: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)

    # Computed properties
    @computed_field
    @cached_property
    def volume_cm3(self) -> float | None:
        """Calculate the volume of the product."""
        if self.height_cm is None or self.width_cm is None or self.depth_cm is None:
            logger.warning("All dimensions must be set to calculate the volume.")
            return None
        return self.height_cm * self.width_cm * self.depth_cm


class CircularityPropertiesBase(CustomBase):
    """Base model to store circularity properties of a product."""

    # Recyclability
    recyclability_observation: str | None = Field(default=None, max_length=500)
    recyclability_comment: str | None = Field(default=None, max_length=100)
    recyclability_reference: str | None = Field(default=None, max_length=100)

    # Repairability
    repairability_observation: str | None = Field(default=None, max_length=500)
    repairability_comment: str | None = Field(default=None, max_length=100)
    repairability_reference: str | None = Field(default=None, max_length=100)

    # Remanufacturability
    remanufacturability_observation: str | None = Field(default=None, max_length=500)
    remanufacturability_comment: str | None = Field(default=None, max_length=100)
    remanufacturability_reference: str | None = Field(default=None, max_length=100)


### Product Base Model ###
class ProductBase(CustomBase):
    """Basic model to store product information."""

    name: str = Field(index=True, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)

    # Dismantling information
    dismantling_notes: str | None = Field(
        default=None, max_length=500, description="Notes on the dismantling process of the product."
    )

    dismantling_time_start: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False), default_factory=lambda: datetime.now(UTC)
    )
    dismantling_time_end: datetime | None = Field(default=None, sa_column=Column(TIMESTAMP(timezone=True)))

    # Time validation
    @model_validator(mode="after")
    def validate_times(self) -> Self:
        """Ensure end time is after start time if both are set."""
        validate_start_and_end_time(self.dismantling_time_start, self.dismantling_time_end)
        return self
