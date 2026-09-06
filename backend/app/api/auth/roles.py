"""User roles and the upload quota tiers they carry.

``is_verified`` gates creating anything and ``is_superuser`` grants ``/admin``; roles
say whether the person is trusted with lab-grade storage. Tiers are strictly ordered,
so a capability gate is a comparison. Add a permission table the first time a
capability breaks the ordering.
"""

from enum import StrEnum

from app.core.config import settings


class UserRole(StrEnum):
    """Ordered contributor tiers. Compare with :func:`role_rank`, not ``<``."""

    CONTRIBUTOR = "contributor"
    LAB = "lab"


DEFAULT_USER_ROLE = UserRole.CONTRIBUTOR

# Explicit rank: StrEnum's alphabetical order matches the tiers only by coincidence.
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
