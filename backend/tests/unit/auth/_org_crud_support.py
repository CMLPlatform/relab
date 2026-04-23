"""Shared helpers for organization CRUD unit tests."""

from __future__ import annotations

import uuid

from app.api.auth.models import OrganizationRole, User
from tests.factories.models import UserFactory


def make_user(
    organization_id: uuid.UUID | None = None,
    organization_role: OrganizationRole | None = None,
    *,
    is_superuser: bool = False,
) -> User:
    """Build a user with organization fields configured for org CRUD tests."""
    user = UserFactory.build(id=uuid.uuid4(), is_superuser=is_superuser)
    user.organization_id = organization_id
    user.organization_role = organization_role
    user.organization = None
    return user
