"""Tolerance and merge behaviour of the user-preferences helpers."""

from app.api.auth.preferences import (
    ProfileVisibility,
    UserPreferences,
    UserPreferencesUpdate,
    load_user_preferences,
    merge_user_preferences,
)


class TestLoadUserPreferences:
    """load_user_preferences tolerates corrupt stored data on the read path."""

    def test_valid_payload_round_trips(self) -> None:
        """A valid payload round-trips to typed preferences."""
        prefs = load_user_preferences({"profile_visibility": "community", "email_updates_enabled": True})
        assert prefs.profile_visibility is ProfileVisibility.COMMUNITY
        assert prefs.email_updates_enabled is True

    def test_none_and_non_dict_fall_back_to_defaults(self) -> None:
        """None or a non-dict yields defaults, not an error."""
        assert load_user_preferences(None) == UserPreferences()
        assert load_user_preferences("garbage") == UserPreferences()

    # Regression: a stored value that no longer validates used to 500 the read
    # unless the offending key was exactly profile_visibility.
    def test_a_bad_non_visibility_value_reverts_to_that_field_default(self) -> None:
        """A bad non-visibility value reverts to that field's default."""
        prefs = load_user_preferences({"theme_mode": "midnight", "email_updates_enabled": True})
        assert prefs.theme_mode == UserPreferences().theme_mode
        # Sibling valid keys survive.
        assert prefs.email_updates_enabled is True

    # Regression: legacy keys from before extra="forbid" must not 500 a read.
    def test_a_legacy_unknown_key_is_dropped(self) -> None:
        """A legacy unknown key is dropped, not raised."""
        prefs = load_user_preferences({"stats_cache": {"n": 1}, "profile_visibility": "private"})
        assert prefs.profile_visibility is ProfileVisibility.PRIVATE

    def test_an_invalid_visibility_fails_closed_to_private(self) -> None:
        """An invalid visibility fails closed to private."""
        prefs = load_user_preferences({"profile_visibility": "everyone"})
        assert prefs.profile_visibility is ProfileVisibility.PRIVATE

    def test_multiple_bad_values_all_revert(self) -> None:
        """Several bad values all revert together."""
        prefs = load_user_preferences({"theme_mode": "midnight", "profile_visibility": "everyone", "junk": 1})
        assert prefs.theme_mode == UserPreferences().theme_mode
        assert prefs.profile_visibility is ProfileVisibility.PRIVATE


class TestMergeUserPreferences:
    """merge_user_preferences applies a partial patch without dropping siblings."""

    def test_partial_patch_preserves_untouched_fields(self) -> None:
        """A partial patch preserves untouched fields."""
        current = {"email_updates_enabled": True, "profile_visibility": "community"}
        merged = merge_user_preferences(current, UserPreferencesUpdate(profile_visibility=ProfileVisibility.PRIVATE))
        assert merged.profile_visibility is ProfileVisibility.PRIVATE
        # Untouched key is not reset to its default.
        assert merged.email_updates_enabled is True

    def test_merge_over_corrupt_current_still_applies_the_patch(self) -> None:
        """Merging over corrupt current data still applies the patch."""
        merged = merge_user_preferences(
            {"theme_mode": "midnight"},
            UserPreferencesUpdate(email_updates_enabled=True),
        )
        assert merged.email_updates_enabled is True
        assert merged.theme_mode == UserPreferences().theme_mode
