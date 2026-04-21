"""Integration tests for auth model persistence and constraints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.auth.models import OrganizationRole
from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

TEST_EMAIL = "test@example.com"
TEST_USERNAME = "testuser"


async def test_email_uniqueness_is_enforced(db_session: AsyncSession) -> None:
    """The database must reject duplicate email addresses."""
    await UserFactory.create_async(db_session, email="unique@example.com", hashed_password="hashed1")

    with pytest.raises(IntegrityError, match="unique"):
        await UserFactory.create_async(db_session, email="unique@example.com", hashed_password="hashed2")


async def test_username_uniqueness_ignores_null_values(db_session: AsyncSession) -> None:
    """Usernames should be unique when present, but nullable usernames remain allowed."""
    await UserFactory.create_async(
        db_session,
        email="named@example.com",
        username="uniqueuser",
        hashed_password="hashed1",
    )
    await UserFactory.create_async(db_session, email="null1@example.com", hashed_password="hashed2", username=None)
    await UserFactory.create_async(db_session, email="null2@example.com", hashed_password="hashed3", username=None)

    with pytest.raises(IntegrityError, match="unique"):
        await UserFactory.create_async(
            db_session,
            email="named2@example.com",
            username="uniqueuser",
            hashed_password="hashed4",
        )


async def test_user_can_join_and_leave_organization(db_session: AsyncSession) -> None:
    """Users should be able to gain and lose organization membership cleanly."""
    owner = await UserFactory.create_async(db_session, email="owner@example.com", hashed_password="hashed")
    organization = await OrganizationFactory.create_async(db_session, name="Test Org", owner_id=owner.id)
    user = await UserFactory.create_async(
        db_session,
        email=TEST_EMAIL,
        hashed_password="hashed",
        organization_id=organization.id,
        organization_role=OrganizationRole.MEMBER,
    )

    assert user.organization_id == organization.id
    assert user.organization_role == OrganizationRole.MEMBER

    user.organization_id = None
    user.organization_role = None
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)

    assert user.organization_id is None
    assert user.organization_role is None


def test_organization_role_enum_values_match_storage_strings() -> None:
    """Enum values should stay aligned with the stored string values."""
    assert OrganizationRole.OWNER.value == "owner"
    assert OrganizationRole.MEMBER.value == "member"
