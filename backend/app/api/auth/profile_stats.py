"""Typed profile-stat snapshot models and helpers.

Auth owns the ``User.profile_stats`` column, so the snapshot write lives here;
the numbers themselves are computed read-only by data_collection.
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, ValidationError

from app.api.auth.models import User

if TYPE_CHECKING:
    from typing import Any

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession


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


async def store_profile_stats(session: AsyncSession, user_id: UUID4, stats: ProfileStatsData) -> None:
    """Stage a recomputed profile-stat snapshot on the session for one user."""
    user = await session.get(User, user_id)
    if user is None:
        return
    user.profile_stats = dump_profile_stats(stats)
    user.profile_stats_computed_at = datetime.now(UTC)
    session.add(user)
