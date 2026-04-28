"""Privacy and redaction policy for public profile and ownership surfaces."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.auth.preferences import ProfileVisibility, load_user_preferences

if TYPE_CHECKING:
    from app.api.auth.models import User


def can_view_profile(owner: User, viewer: User | None) -> bool:
    """Return whether ``viewer`` can see ``owner``'s public profile.

    Rules:
    - Admins always see everything.
    - public    → everyone can view.
    - community → authenticated users can view.
    - private   → only the owner and admins can view.
    """
    if viewer and viewer.is_superuser:
        return True

    visibility = load_user_preferences(owner.preferences).profile_visibility

    if visibility == ProfileVisibility.PRIVATE:
        return bool(viewer and viewer.id == owner.id)
    if visibility == ProfileVisibility.COMMUNITY:
        return viewer is not None
    return True


def should_redact_owner_identity(owner: User, viewer: User | None) -> bool:
    """Return True when ``owner``'s product attribution should be hidden."""
    return not can_view_profile(owner, viewer)


def should_redact_owner(owner: User, viewer: User | None) -> bool:
    """Backward-compatible alias for owner attribution redaction policy."""
    return should_redact_owner_identity(owner, viewer)
