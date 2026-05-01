"""Unit tests for profile and owner-identity privacy policy."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.auth.preferences import ProfileVisibility, ThemeMode, UserPreferences, UserPreferencesUpdate
from app.api.auth.services.privacy import can_view_profile, should_redact_owner_identity
from tests.factories.models import UserFactory


@pytest.mark.parametrize(
    ("visibility", "viewer_kind", "expected"),
    [
        ("public", "guest", (True, False)),
        ("public", "owner", (True, False)),
        ("public", "other", (True, False)),
        ("public", "admin", (True, False)),
        ("community", "guest", (False, True)),
        ("community", "owner", (True, False)),
        ("community", "other", (True, False)),
        ("community", "admin", (True, False)),
        ("private", "guest", (False, True)),
        ("private", "owner", (True, False)),
        ("private", "other", (False, True)),
        ("private", "admin", (True, False)),
    ],
)
def test_profile_visibility_policy_matrix(
    visibility: str,
    viewer_kind: str,
    expected: tuple[bool, bool],
) -> None:
    """Profile visibility and product owner redaction use the same policy."""
    owner = UserFactory.build(preferences={"profile_visibility": visibility})
    viewer = {
        "guest": None,
        "owner": UserFactory.build(id=owner.id),
        "other": UserFactory.build(),
        "admin": UserFactory.build(is_superuser=True),
    }[viewer_kind]

    expected_can_view, expected_redacts = expected
    assert can_view_profile(owner, viewer) is expected_can_view
    assert should_redact_owner_identity(owner, viewer) is expected_redacts


def test_user_preferences_keep_enum_instances_at_runtime() -> None:
    """Typed preferences should stay typed until JSON serialization."""
    preferences = UserPreferences.model_validate(
        {
            "profile_visibility": "private",
            "theme_mode": "dark",
            "email_updates_enabled": True,
        }
    )

    assert preferences.profile_visibility is ProfileVisibility.PRIVATE
    assert preferences.theme_mode is ThemeMode.DARK
    assert preferences.email_updates_enabled is True
    assert preferences.model_dump(mode="json")["profile_visibility"] == "private"


def test_user_preferences_default_email_updates_to_disabled() -> None:
    """Recurring email updates should default to opt-out until a workflow exists."""
    preferences = UserPreferences()

    assert preferences.email_updates_enabled is False


def test_user_preferences_update_rejects_unknown_keys() -> None:
    """Clients should not persist arbitrary preference keys."""
    with pytest.raises(ValidationError):
        UserPreferencesUpdate.model_validate({"unknown_feature_flag": True})


def test_malformed_stored_profile_visibility_falls_back_closed_for_privacy() -> None:
    """Bad persisted visibility values should not leak profile or owner identity."""
    owner = UserFactory.build(preferences={"profile_visibility": "friends-only"})
    viewer = UserFactory.build()

    assert can_view_profile(owner, viewer) is False
    assert should_redact_owner_identity(owner, viewer) is True
