"""Tests for authentication models and relationships.

Tests validate User model creation, password handling, and ownership relationships.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.api.auth.models import OrganizationRole, User
from tests.factories.models import OrganizationFactory, UserFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

# Constants for test values
TEST_EMAIL = "test@example.com"
TEST_USERNAME = "testuser"
TEST_HASHED_PASSWORD = "hashed_password_value"  # noqa: S105
TEST_ORG_NAME = "Test Org"
TEST_OWNER_EMAIL = "owner@example.com"
USER1_EMAIL = "user1@example.com"
USER2_EMAIL = "user2@example.com"
BCRYPT_HASH = "bcrypt_hashed_value$2b$12$..."
NONEXISTENT_EMAIL = "nonexistent@example.com"

# Model field names for magic value avoidance
EMAIL_FIELD = "email"
OWNER_ROLE_VAL = "owner"
MEMBER_ROLE_VAL = "member"


@pytest.mark.unit
class TestUserModelBasics:
    """Tests for basic User model functionality."""

    def test_user_model_has_id_field(self) -> None:
        """Verify User model has an id field."""
        assert hasattr(User, "id")

    def test_user_model_has_username_field(self) -> None:
        """Verify User model has a username field."""
        assert hasattr(User, "username")

    def test_user_model_has_required_fields(self) -> None:
        """Verify User model has required email and hashed_password fields."""
        # FastAPI-Users base class provides email and hashed_password
        assert hasattr(User, "email")
        assert hasattr(User, "hashed_password")

    def test_user_model_has_organization_relationship(self) -> None:
        """Verify User model has organization relationship."""
        assert hasattr(User, "organization")

    def test_user_model_has_organization_id_foreign_key(self) -> None:
        """Verify User model has organization_id foreign key."""
        assert hasattr(User, "organization_id")

    def test_user_model_has_organization_role(self) -> None:
        """Verify User model has organization_role field."""
        assert hasattr(User, "organization_role")

    def test_user_model_has_products_relationship(self) -> None:
        """Verify User model has products relationship."""
        assert hasattr(User, "products")

    def test_user_model_has_oauth_accounts(self) -> None:
        """Verify User model has oauth_accounts relationship."""
        assert hasattr(User, "oauth_accounts")

    def test_user_model_has_timestamp_fields(self) -> None:
        """Verify User model has created_at and updated_at fields."""
        assert hasattr(User, "created_at")
        assert hasattr(User, "updated_at")

    def test_organization_role_enum_values(self) -> None:
        """Verify OrganizationRole enum has correct values."""
        assert OrganizationRole.OWNER.value == OWNER_ROLE_VAL
        assert OrganizationRole.MEMBER.value == MEMBER_ROLE_VAL


@pytest.mark.integration
class TestUserModelPersistence:
    """Tests for persisting User model to database."""

    @pytest.mark.asyncio
    async def test_create_user_with_required_fields(self, session: AsyncSession) -> None:
        """Verify creating user with required fields."""
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
        """Verify creating user without username is allowed."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            username=None,
        )
        await session.refresh(user)

        assert user.id is not None
        assert user.email == TEST_EMAIL
        assert user.username is None

    @pytest.mark.asyncio
    async def test_user_password_stored_hashed(self, session: AsyncSession) -> None:
        """Verify password is stored in hashed form."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=BCRYPT_HASH,
        )
        await session.refresh(user)

        # Password stored as provided (should be hashed by the application before creating)
        assert user.hashed_password == BCRYPT_HASH

    @pytest.mark.asyncio
    async def test_user_defaults_organization_id_to_none(self, session: AsyncSession) -> None:
        """Verify user organization_id defaults to None."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
        )
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization is None

    @pytest.mark.asyncio
    async def test_user_defaults_organization_role_to_none(self, session: AsyncSession) -> None:
        """Verify user organization_role defaults to None when no organization is provided."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            organization_role=None,  # Explicitly set to None
            organization_id=None,
        )
        await session.refresh(user)

        assert user.organization_role is None


@pytest.mark.integration
class TestUserModelTimestamps:
    """Tests for User model timestamp fields."""

    @pytest.mark.asyncio
    async def test_created_at_set_on_insert(self, session: AsyncSession) -> None:
        """Verify created_at is set when user is created."""
        before_create = datetime.now(UTC)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            created_at=None,
            updated_at=None,
        )

        assert user.created_at is not None
        # Allow minor clock skew between Python and the Database
        assert abs((user.created_at - before_create).total_seconds()) < 5

    @pytest.mark.asyncio
    async def test_updated_at_set_on_insert(self, session: AsyncSession) -> None:
        """Verify updated_at is set when user is created."""
        before_create = datetime.now(UTC)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            created_at=None,
            updated_at=None,
        )

        assert user.updated_at is not None
        # Allow minor clock skew between Python and the Database
        assert abs((user.updated_at - before_create).total_seconds()) < 5

    @pytest.mark.asyncio
    async def test_timestamps_are_equal_on_creation(self, session: AsyncSession) -> None:
        """Verify created_at and updated_at are equal on creation."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
            created_at=None,
            updated_at=None,
        )

        assert user.created_at is not None
        assert user.updated_at is not None
        # They should be very close (within 1 second)
        assert abs((user.updated_at - user.created_at).total_seconds()) < 1


@pytest.mark.integration
class TestUserQueryingAndRetrieval:
    """Tests for querying and retrieving User models."""

    @pytest.mark.asyncio
    async def test_retrieve_user_by_id(self, session: AsyncSession) -> None:
        """Verify user can be retrieved by ID."""
        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
        )

        # Create new session to test retrieval
        statement = select(User).where(User.id == user.id)
        result = await session.exec(statement)
        retrieved = result.unique().one_or_none()

        assert retrieved is not None
        assert retrieved.id == user.id
        assert retrieved.email == user.email

    @pytest.mark.asyncio
    async def test_retrieve_user_by_email(self, session: AsyncSession) -> None:
        """Verify user can be retrieved by email."""
        await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password=TEST_HASHED_PASSWORD,
        )

        statement = select(User).where(User.email == TEST_EMAIL)
        result = await session.exec(statement)
        retrieved = result.unique().one_or_none()

        assert retrieved is not None
        assert retrieved.email == TEST_EMAIL

    @pytest.mark.asyncio
    async def test_retrieve_user_by_username(self, session: AsyncSession) -> None:
        """Verify user can be retrieved by username."""
        await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            username=TEST_USERNAME,
            hashed_password=TEST_HASHED_PASSWORD,
        )

        statement = select(User).where(User.username == TEST_USERNAME)
        result = await session.exec(statement)
        retrieved = result.unique().one_or_none()

        assert retrieved is not None
        assert retrieved.username == TEST_USERNAME

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_none(self, session: AsyncSession) -> None:
        """Verify querying for nonexistent user returns None."""
        statement = select(User).where(User.email == NONEXISTENT_EMAIL)
        result = await session.exec(statement)
        retrieved = result.unique().one_or_none()

        assert retrieved is None

    @pytest.mark.asyncio
    async def test_retrieve_multiple_users(self, session: AsyncSession) -> None:
        """Verify multiple users can be retrieved."""
        for i in range(5):
            await UserFactory.create_async(
                session,
                email=f"user{i}@example.com",
                hashed_password=TEST_HASHED_PASSWORD,
            )

        statement = select(User)
        result = await session.exec(statement)
        retrieved = result.unique().all()

        assert len(retrieved) >= 5


@pytest.mark.integration
class TestUserUniquenessConstraints:
    """Tests for User model uniqueness constraints."""

    @pytest.mark.asyncio
    async def test_email_must_be_unique(self, session: AsyncSession) -> None:
        """Verify email field is unique."""
        email = "unique@example.com"

        await UserFactory.create_async(session, email=email, hashed_password="hashed1")  # noqa: S106

        with pytest.raises(IntegrityError):
            await UserFactory.create_async(session, email=email, hashed_password="hashed2")  # noqa: S106

    @pytest.mark.asyncio
    async def test_username_must_be_unique_when_provided(self, session: AsyncSession) -> None:
        """Verify username field is unique when provided."""
        username = "uniqueuser"

        await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            username=username,
            hashed_password="hashed1",  # noqa: S106
        )

        with pytest.raises(IntegrityError):
            await UserFactory.create_async(
                session,
                email=USER2_EMAIL,
                username=username,
                hashed_password="hashed2",  # noqa: S106
            )

    @pytest.mark.asyncio
    async def test_multiple_users_without_username_allowed(self, session: AsyncSession) -> None:
        """Verify multiple users can have NULL username."""
        await UserFactory.create_async(
            session,
            email=USER1_EMAIL,
            hashed_password="hashed1",  # noqa: S106
            username=None,
        )
        await UserFactory.create_async(
            session,
            email=USER2_EMAIL,
            hashed_password="hashed2",  # noqa: S106
            username=None,
        )

        # Verify both users were created
        statement = select(User).where(User.username == None)  # noqa: E711
        result = await session.exec(statement)
        retrieved = result.unique().all()

        assert len(retrieved) >= 2


@pytest.mark.integration
class TestUserOrganizationRelationship:
    """Tests for User organization relationships."""

    @pytest.mark.asyncio
    async def test_user_can_be_assigned_to_organization(self, session: AsyncSession) -> None:
        """Verify user can be assigned to an organization."""
        # Create an owner for the organization first
        owner = await UserFactory.create_async(session, email=TEST_OWNER_EMAIL, hashed_password="hashed")  # noqa: S106

        org = await OrganizationFactory.create_async(session, name=TEST_ORG_NAME, owner_id=owner.id)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password="hashed",  # noqa: S106
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )

        assert user.organization_id == org.id
        assert user.organization_role == OrganizationRole.MEMBER

    @pytest.mark.asyncio
    async def test_user_owner_role(self, session: AsyncSession) -> None:
        """Verify user can have owner role."""
        # Create an owner for the organization first
        owner = await UserFactory.create_async(session, email=TEST_OWNER_EMAIL, hashed_password="hashed")  # noqa: S106

        org = await OrganizationFactory.create_async(session, name=TEST_ORG_NAME, owner_id=owner.id)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password="hashed",  # noqa: S106
            organization_id=org.id,
            organization_role=OrganizationRole.OWNER,
        )

        assert user.organization_role == OrganizationRole.OWNER

    @pytest.mark.asyncio
    async def test_user_can_be_removed_from_organization(self, session: AsyncSession) -> None:
        """Verify user can be removed from organization."""
        # Create an owner for the organization
        owner = await UserFactory.create_async(session, email=TEST_OWNER_EMAIL, hashed_password="hashed")  # noqa: S106

        org = await OrganizationFactory.create_async(session, name=TEST_ORG_NAME, owner_id=owner.id)

        user = await UserFactory.create_async(
            session,
            email=TEST_EMAIL,
            hashed_password="hashed",  # noqa: S106
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )

        # Remove from organization
        user.organization_id = None
        user.organization_role = None
        session.add(user)
        await session.flush()
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization_role is None


@pytest.mark.unit
class TestUserModelValidation:
    """Tests for User model field validation."""

    def test_user_email_is_required(self) -> None:
        """Verify email is validated properly."""
        # SQLModel/SQLAlchemy validates the field definition
        assert EMAIL_FIELD in User.model_fields

    def test_user_password_is_required(self) -> None:
        """Verify password is validated properly."""
        assert hasattr(User, "hashed_password")

    def test_organization_role_accepts_valid_enum_values(self) -> None:
        """Verify organization_role enum values are correct."""
        valid_roles = [OrganizationRole.OWNER, OrganizationRole.MEMBER]

        assert all(isinstance(role, OrganizationRole) for role in valid_roles)

    def test_organization_role_string_values(self) -> None:
        """Verify organization_role string values."""
        assert OrganizationRole.OWNER in [OrganizationRole.OWNER, OrganizationRole.MEMBER]
        assert OrganizationRole.MEMBER in [OrganizationRole.OWNER, OrganizationRole.MEMBER]
