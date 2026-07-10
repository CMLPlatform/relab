"""Typed user-preferences models and helpers."""

from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, ValidationError

if TYPE_CHECKING:
    from typing import Any


PROFILE_VISIBILITY_FIELD = "profile_visibility"


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

    email_updates_enabled: bool = False
    profile_visibility: ProfileVisibility = ProfileVisibility.PUBLIC
    theme_mode: ThemeMode = ThemeMode.AUTO
    products_welcome_dismissed: bool = False
    rpi_camera_enabled: bool = False
    youtube_streaming_enabled: bool = False

    model_config = ConfigDict(extra="forbid")


class UserPreferencesUpdate(BaseModel):
    """Patch model for user preferences updates."""

    email_updates_enabled: bool | None = None
    profile_visibility: ProfileVisibility | None = None
    theme_mode: ThemeMode | None = None
    products_welcome_dismissed: bool | None = None
    rpi_camera_enabled: bool | None = None
    youtube_streaming_enabled: bool | None = None

    model_config = ConfigDict(extra="forbid")


def load_user_preferences(payload: object | None) -> UserPreferences:
    """Return typed preferences from a stored JSON payload.

    Reading a user's own stored preferences must never fail the request: a value
    that no longer validates (a removed enum member, a legacy key from before
    ``extra="forbid"``) is dropped in favour of that field's default, and an
    invalid ``profile_visibility`` fails *closed* to private rather than public.
    """
    if not isinstance(payload, dict):
        return UserPreferences()
    try:
        return UserPreferences.model_validate(payload)
    except ValidationError as exc:
        invalid_fields = {error["loc"][0] for error in exc.errors() if error["loc"]}
        # Keep only keys that are both known and not the ones that failed, so each
        # bad value reverts to its default. profile_visibility instead fails closed.
        cleaned = {
            key: value
            for key, value in payload.items()
            if key in UserPreferences.model_fields and key not in invalid_fields
        }
        if PROFILE_VISIBILITY_FIELD in invalid_fields:
            cleaned[PROFILE_VISIBILITY_FIELD] = ProfileVisibility.PRIVATE
        return UserPreferences.model_validate(cleaned)


def merge_user_preferences(
    current: object | None,
    update: UserPreferencesUpdate,
) -> UserPreferences:
    """Merge a patch into the current stored preferences."""
    current_preferences = load_user_preferences(current)
    payload: dict[str, Any] = {
        **current_preferences.model_dump(mode="json"),
        **update.model_dump(mode="json", exclude_unset=True),
    }
    return UserPreferences.model_validate(payload)
