"""Enums for common use across the application.

These are separated from the models to avoid circular imports as much as possible.
"""

from enum import Enum


class Unit(Enum):
    """Allowed units in the data collection."""

    # TODO: Use pint for unit management in business logic

    KILOGRAM = "kg"
    GRAM = "g"
    METER = "m"
    CENTIMETER = "cm"
