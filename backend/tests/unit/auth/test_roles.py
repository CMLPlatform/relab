"""Tests for contributor roles and the upload quota tiers they carry."""

import pytest

from app.api.auth.roles import (
    DEFAULT_USER_ROLE,
    UserRole,
    has_role_at_least,
    role_rank,
    upload_quota_bytes_for_role,
    upload_quota_files_for_role,
)


def test_default_role_is_the_least_privileged_tier() -> None:
    """New and backfilled accounts must land on the lowest tier, not the highest."""
    assert DEFAULT_USER_ROLE is UserRole.CONTRIBUTOR
    assert role_rank(DEFAULT_USER_ROLE) == min(role_rank(role) for role in UserRole)


def test_rank_increases_with_declaration_order() -> None:
    """Rank must follow the declared tier order, not the enum's alphabetical comparison.

    The two agree today only by coincidence, so this asserts the declared order
    directly — a tier whose name sorts against its privilege must still rank right.
    """
    ranks = [role_rank(role) for role in UserRole]
    assert ranks == sorted(ranks)
    assert len(set(ranks)) == len(ranks)
    assert role_rank(UserRole.LAB) > role_rank(UserRole.CONTRIBUTOR)


@pytest.mark.parametrize(
    ("role", "minimum", "expected"),
    [
        (UserRole.CONTRIBUTOR, UserRole.CONTRIBUTOR, True),
        (UserRole.CONTRIBUTOR, UserRole.LAB, False),
        (UserRole.LAB, UserRole.CONTRIBUTOR, True),
        (UserRole.LAB, UserRole.LAB, True),
    ],
)
def test_has_role_at_least(role: UserRole, minimum: UserRole, *, expected: bool) -> None:
    """Every ordering pair should resolve as the tier order implies."""
    assert has_role_at_least(role, minimum) is expected


def test_every_role_has_a_rank() -> None:
    """A tier added without a rank must fail here rather than at a permission check."""
    for role in UserRole:
        assert isinstance(role_rank(role), int)


def test_lab_quota_exceeds_the_contributor_quota() -> None:
    """The lab tier only means something if it is actually larger."""
    assert upload_quota_files_for_role(UserRole.LAB) > upload_quota_files_for_role(UserRole.CONTRIBUTOR)
    assert upload_quota_bytes_for_role(UserRole.LAB) > upload_quota_bytes_for_role(UserRole.CONTRIBUTOR)


def test_quota_bytes_are_megabyte_settings_converted() -> None:
    """Byte quotas must be converted from the MB settings, not returned raw."""
    from app.core.config import settings  # noqa: PLC0415 -- read after test env settings are loaded

    assert upload_quota_bytes_for_role(UserRole.CONTRIBUTOR) == settings.max_upload_bytes_per_user_mb * 1024 * 1024
    assert upload_quota_bytes_for_role(UserRole.LAB) == settings.max_upload_bytes_per_lab_user_mb * 1024 * 1024
