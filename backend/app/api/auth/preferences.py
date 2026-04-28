"""Typed user-preferences models and helpers."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, ValidationError

if TYPE_CHECKING:
    from typing import Any


class ProfileVisibility(StrEnum):
    """Discrete values stored on ``User.preferences["profile_visibility"]``."""

    PUBLIC = "public"
    COMMUNITY = "community"
    PRIVATE = "private"


class ThemeMode(StrEnum):
    """Supported app theme modes."""

    LIGHT = "light"
    DARK = "dark"
    AUTO = "auto"


class UserPreferences(BaseModel):
    """Typed user preferences persisted as JSONB."""

    profile_visibility: ProfileVisibility = ProfileVisibility.PUBLIC
    theme_mode: ThemeMode = ThemeMode.AUTO
    products_welcome_dismissed: bool = False
    rpi_camera_enabled: bool = False
    youtube_streaming_enabled: bool = False

    model_config = ConfigDict(extra="allow")


class UserPreferencesUpdate(BaseModel):
    """Patch model for user preferences updates."""

    profile_visibility: ProfileVisibility | None = None
    theme_mode: ThemeMode | None = None
    products_welcome_dismissed: bool | None = None
    rpi_camera_enabled: bool | None = None
    youtube_streaming_enabled: bool | None = None

    model_config = ConfigDict(extra="allow")


def load_user_preferences(payload: object | None) -> UserPreferences:
    """Return typed preferences from a stored JSON payload."""
    if not isinstance(payload, dict):
        return UserPreferences()
    try:
        return UserPreferences.model_validate(payload)
    except ValidationError as exc:
        if any(error["loc"] == ("profile_visibility",) for error in exc.errors()):
            return UserPreferences.model_validate(
                {
                    **payload,
                    "profile_visibility": ProfileVisibility.PRIVATE,
                }
            )
        raise


def merge_user_preferences(
    current: object | None,
    update: UserPreferencesUpdate | dict[str, object],
) -> UserPreferences:
    """Merge a patch into the current stored preferences."""
    current_preferences = load_user_preferences(current)
    update_model = update if isinstance(update, UserPreferencesUpdate) else UserPreferencesUpdate.model_validate(update)
    payload: dict[str, Any] = {
        **current_preferences.model_dump(mode="json"),
        **update_model.model_dump(mode="json", exclude_unset=True),
    }
    return UserPreferences.model_validate(payload)
