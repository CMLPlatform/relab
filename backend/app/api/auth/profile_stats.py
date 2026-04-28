"""Typed profile-stat snapshot models and helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, ValidationError

if TYPE_CHECKING:
    from typing import Any


class ProfileStatsData(BaseModel):
    """Typed persisted profile-stat snapshot stored as JSONB."""

    product_count: int = 0
    total_weight_g: int = 0
    image_count: int = 0
    top_category: str | None = None

    model_config = ConfigDict(extra="allow")

    @property
    def total_weight_kg(self) -> float:
        """Return the stored gram total converted to kilograms."""
        return round(self.total_weight_g / 1000.0, 2)


def load_profile_stats(payload: object | None) -> ProfileStatsData:
    """Return typed profile stats from a stored JSON payload."""
    if not isinstance(payload, dict):
        return ProfileStatsData()
    try:
        return ProfileStatsData.model_validate(payload)
    except ValidationError:
        return ProfileStatsData()


def dump_profile_stats(stats: ProfileStatsData) -> dict[str, Any]:
    """Serialize profile stats for JSONB persistence."""
    return stats.model_dump(mode="json", exclude_none=True)
