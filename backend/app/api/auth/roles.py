"""User roles and the upload quota tiers they carry.

Roles answer "what kind of contributor is this", which the three account
booleans cannot express: ``is_verified`` gates whether an account may create
anything at all, and ``is_superuser`` grants the ``/admin`` routes. Neither says
whether the person is trusted with lab-grade storage or non-image research
files.

The values are ordered, so a capability gate is a comparison rather than a
permission matrix — a matrix over strictly ordered tiers is a table with one
meaningful column. Add a real permission table the first time a capability
breaks the ordering.
"""

from enum import StrEnum

from app.core.config import settings


class UserRole(StrEnum):
    """Ordered contributor tiers. Compare with :func:`role_rank`, not ``<``."""

    CONTRIBUTOR = "contributor"
    LAB = "lab"


DEFAULT_USER_ROLE = UserRole.CONTRIBUTOR

# Ordering is explicit rather than left to StrEnum's alphabetical comparison, which
# agrees with the tier order here only by coincidence ("contributor" < "lab"). Any
# plausible third tier breaks it — a "viewer" below both still sorts above "lab".
_ROLE_RANK: dict[UserRole, int] = {
    UserRole.CONTRIBUTOR: 0,
    UserRole.LAB: 1,
}


def role_rank(role: UserRole) -> int:
    """Return the ordering rank of ``role``, higher being more privileged."""
    return _ROLE_RANK[role]


def has_role_at_least(role: UserRole, minimum: UserRole) -> bool:
    """Return whether ``role`` meets or exceeds ``minimum``."""
    return role_rank(role) >= role_rank(minimum)


def upload_quota_files_for_role(role: UserRole) -> int:
    """Return the file-count upload quota for ``role``."""
    if role is UserRole.LAB:
        return settings.max_upload_files_per_lab_user
    return settings.max_upload_files_per_user


def upload_quota_bytes_for_role(role: UserRole) -> int:
    """Return the byte upload quota for ``role``."""
    if role is UserRole.LAB:
        return settings.max_upload_bytes_per_lab_user_mb * 1024 * 1024
    return settings.max_upload_bytes_per_user_mb * 1024 * 1024
