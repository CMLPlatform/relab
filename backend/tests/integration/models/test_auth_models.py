"""Integration tests for auth model persistence and database constraints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.auth.models import OrganizationRole, User
from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

TEST_EMAIL = "test@example.com"
TEST_USERNAME = "testuser"
TEST_HASHED_PASSWORD = "hashed_password_value"
TEST_ORG_NAME = "Test Org"
TEST_OWNER_EMAIL = "owner@example.com"
USER1_EMAIL = "user1@example.com"
USER2_EMAIL = "user2@example.com"


@pytest.mark.integration
class TestUserModelPersistence:
    """Tests for persisting User model to database."""

    @pytest.mark.asyncio
    async def test_create_user_with_required_fields(self, session: AsyncSession) -> None:
        """Verify id and timestamps are auto-populated on creation."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            username=TEST_USERNAME,
            hashed_password=TEST_HASHED_PASSWORD,
        )
        await session.refresh(user)

        assert user.id is not None
        assert user.email == TEST_EMAIL
        assert user.username == TEST_USERNAME
        assert user.created_at is not None
        assert user.updated_at is not None

    @pytest.mark.asyncio
    async def test_create_user_without_username(self, session: AsyncSession) -> None:
        """Verify username is nullable."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            username=None,
        )
        await session.refresh(user)

        assert user.id is not None
        assert user.username is None

    @pytest.mark.asyncio
    async def test_user_defaults_organization_fields_to_none(self, session: AsyncSession) -> None:
        """Verify organization_id and organization_role default to None."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            organization_role=None,
            organization_id=None,
        )
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization is None
        assert user.organization_role is None


@pytest.mark.integration
class TestUserModelTimestamps:
    """created_at and updated_at are populated by the database on insert."""

    @pytest.mark.asyncio
    async def test_created_at_set_on_insert(self, session: AsyncSession) -> None:
        """Verify created_at is set on insert and is close to the current time."""
        before_create = datetime.now(UTC)
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            created_at=None,
            updated_at=None,
        )
        assert user.created_at is not None
        assert abs((user.created_at - before_create).total_seconds()) < 5

    @pytest.mark.asyncio
    async def test_updated_at_set_on_insert(self, session: AsyncSession) -> None:
        """Verify updated_at is set on insert and is close to the current time."""
        before_create = datetime.now(UTC)
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            created_at=None,
            updated_at=None,
        )
        assert user.updated_at is not None
        assert abs((user.updated_at - before_create).total_seconds()) < 5


@pytest.mark.integration
class TestUserUniquenessConstraints:
    """User model uniqueness constraints enforced at the database level."""

    @pytest.mark.asyncio
    async def test_email_must_be_unique(self, session: AsyncSession) -> None:
        """Verify that creating two users with the same email violates the uniqueness constraint."""
        email = "unique@example.com"
        await UserFactory.create_async(session, email=email, hashed_password="hashed1")

        with pytest.raises(IntegrityError, match="unique"):
            await UserFactory.create_async(session, email=email, hashed_password="hashed2")

    @pytest.mark.asyncio
    async def test_username_must_be_unique_when_provided(self, session: AsyncSession) -> None:
        """Verify that creating two users with the same non-NULL username violates the uniqueness constraint."""
        username = "uniqueuser"
        await UserFactory.create_async(session, email=USER1_EMAIL, username=username, hashed_password="hashed1")

        with pytest.raises(IntegrityError, match="unique"):
            await UserFactory.create_async(session, email=USER2_EMAIL, username=username, hashed_password="hashed2")

    @pytest.mark.asyncio
    async def test_multiple_users_without_username_allowed(self, session: AsyncSession) -> None:
        """NULL username is not subject to the uniqueness constraint."""
        await UserFactory.create_async(session, email=USER1_EMAIL, hashed_password="hashed1", username=None)
        await UserFactory.create_async(session, email=USER2_EMAIL, hashed_password="hashed2", username=None)
        # No IntegrityError means the test passes


@pytest.mark.integration
class TestUserOrganizationRelationship:
    """Tests for User organization membership."""

    @pytest.mark.asyncio
    async def test_user_can_be_assigned_to_organization(self, session: AsyncSession) -> None:
        """Verify a user can be assigned an organization_id and organization_role."""
        owner = await UserFactory.create_async(session, email=TEST_OWNER_EMAIL, hashed_password="hashed")
        org = await OrganizationFactory.create_async(session, name=TEST_ORG_NAME, owner_id=owner.id)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password="hashed",
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )

        assert user.organization_id == org.id
        assert user.organization_role == OrganizationRole.MEMBER

    @pytest.mark.asyncio
    async def test_user_can_be_removed_from_organization(self, session: AsyncSession) -> None:
        """Verify a user can be removed from an organization by setting the org_id and org_role to None."""
        owner = await UserFactory.create_async(session, email=TEST_OWNER_EMAIL, hashed_password="hashed")
        org = await OrganizationFactory.create_async(session, name=TEST_ORG_NAME, owner_id=owner.id)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password="hashed",
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )

        user.organization_id = None
        user.organization_role = None
        session.add(user)
        await session.flush()
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization_role is None


@pytest.mark.unit
class TestOrganizationRoleEnum:
    """OrganizationRole enum values match the expected strings."""

    def test_enum_values(self) -> None:
        """Verify enum values match expected strings for database storage."""
        assert OrganizationRole.OWNER.value == "owner"
        assert OrganizationRole.MEMBER.value == "member"

    def test_user_model_has_required_fields(self) -> None:
        """Spot-check that required fields exist on the User model class."""
        """Spot-check that key fields exist on the User model class."""
        for field in ("id", "email", "hashed_password", "username", "organization_id", "organization_role"):
            assert hasattr(User, field), f"User is missing field: {field}"
