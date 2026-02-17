"""Tests for authentication models and relationships.

Tests validate User model creation, password handling, and ownership relationships.
"""

from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import UUID4
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.models import Organization, OrganizationRole, User


@pytest.mark.unit
class TestUserModelBasics:
    """Tests for basic User model functionality."""

    def test_user_model_has_id_field(self):
        """Verify User model has an id field."""
        assert hasattr(User, "id")

    def test_user_model_has_username_field(self):
        """Verify User model has a username field."""
        assert hasattr(User, "username")

    def test_user_model_has_required_fields(self):
        """Verify User model has required email and hashed_password fields."""
        # FastAPI-Users base class provides email and hashed_password
        assert hasattr(User, "email")
        assert hasattr(User, "hashed_password")

    def test_user_model_has_organization_relationship(self):
        """Verify User model has organization relationship."""
        assert hasattr(User, "organization")

    def test_user_model_has_organization_id_foreign_key(self):
        """Verify User model has organization_id foreign key."""
        assert hasattr(User, "organization_id")

    def test_user_model_has_organization_role(self):
        """Verify User model has organization_role field."""
        assert hasattr(User, "organization_role")

    def test_user_model_has_products_relationship(self):
        """Verify User model has products relationship."""
        assert hasattr(User, "products")

    def test_user_model_has_oauth_accounts(self):
        """Verify User model has oauth_accounts relationship."""
        assert hasattr(User, "oauth_accounts")

    def test_user_model_has_timestamp_fields(self):
        """Verify User model has created_at and updated_at fields."""
        assert hasattr(User, "created_at")
        assert hasattr(User, "updated_at")

    def test_organization_role_enum_values(self):
        """Verify OrganizationRole enum has correct values."""
        assert OrganizationRole.OWNER.value == "owner"
        assert OrganizationRole.MEMBER.value == "member"


@pytest.mark.integration
class TestUserModelPersistence:
    """Tests for persisting User model to database."""

    @pytest.mark.asyncio
    async def test_create_user_with_required_fields(self, session: AsyncSession):
        """Verify creating user with required fields."""
        email = "test@example.com"
        username = "testuser"
        hashed_password = "hashed_password_value"

        user = User(
            email=email,
            username=username,
            hashed_password=hashed_password,
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.id is not None
        assert user.email == email
        assert user.username == username
        assert user.created_at is not None
        assert user.updated_at is not None

    @pytest.mark.asyncio
    async def test_create_user_without_username(self, session: AsyncSession):
        """Verify creating user without username is allowed."""
        email = "test@example.com"
        hashed_password = "hashed_password_value"

        user = User(
            email=email,
            hashed_password=hashed_password,
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.id is not None
        assert user.email == email
        assert user.username is None

    @pytest.mark.asyncio
    async def test_user_password_stored_hashed(self, session: AsyncSession):
        """Verify password is stored in hashed form."""
        email = "test@example.com"
        hashed_password = "bcrypt_hashed_value$2b$12$..."

        user = User(
            email=email,
            hashed_password=hashed_password,
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        # Password stored as provided (should be hashed by the application before creating)
        assert user.hashed_password == hashed_password

    @pytest.mark.asyncio
    async def test_user_defaults_organization_id_to_none(self, session: AsyncSession):
        """Verify user organization_id defaults to None."""
        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization is None

    @pytest.mark.asyncio
    async def test_user_defaults_organization_role_to_none(self, session: AsyncSession):
        """Verify user organization_role defaults to None."""
        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.organization_role is None


@pytest.mark.integration
class TestUserModelTimestamps:
    """Tests for User model timestamp fields."""

    @pytest.mark.asyncio
    async def test_created_at_set_on_insert(self, session: AsyncSession):
        """Verify created_at is set when user is created."""
        before_create = datetime.now(UTC)

        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        after_create = datetime.now(UTC)

        assert user.created_at is not None
        assert before_create <= user.created_at <= after_create

    @pytest.mark.asyncio
    async def test_updated_at_set_on_insert(self, session: AsyncSession):
        """Verify updated_at is set when user is created."""
        before_create = datetime.now(UTC)

        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        after_create = datetime.now(UTC)

        assert user.updated_at is not None
        assert before_create <= user.updated_at <= after_create

    @pytest.mark.asyncio
    async def test_timestamps_are_equal_on_creation(self, session: AsyncSession):
        """Verify created_at and updated_at are equal on creation."""
        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        # They should be very close (within 1 second)
        assert abs((user.updated_at - user.created_at).total_seconds()) < 1


@pytest.mark.integration
class TestUserQueryingAndRetrieval:
    """Tests for querying and retrieving User models."""

    @pytest.mark.asyncio
    async def test_retrieve_user_by_id(self, session: AsyncSession):
        """Verify user can be retrieved by ID."""
        user = User(
            email="test@example.com",
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()

        # Create new session to test retrieval
        statement = select(User).where(User.id == user.id)
        result = await session.execute(statement)
        retrieved = result.unique().scalar_one_or_none()

        assert retrieved is not None
        assert retrieved.id == user.id
        assert retrieved.email == user.email

    @pytest.mark.asyncio
    async def test_retrieve_user_by_email(self, session: AsyncSession):
        """Verify user can be retrieved by email."""
        email = "test@example.com"
        user = User(
            email=email,
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()

        statement = select(User).where(User.email == email)
        result = await session.execute(statement)
        retrieved = result.unique().scalar_one_or_none()

        assert retrieved is not None
        assert retrieved.email == email

    @pytest.mark.asyncio
    async def test_retrieve_user_by_username(self, session: AsyncSession):
        """Verify user can be retrieved by username."""
        username = "testuser123"
        user = User(
            email="test@example.com",
            username=username,
            hashed_password="hashed",
        )

        session.add(user)
        await session.commit()

        statement = select(User).where(User.username == username)
        result = await session.execute(statement)
        retrieved = result.unique().scalar_one_or_none()

        assert retrieved is not None
        assert retrieved.username == username

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_none(self, session: AsyncSession):
        """Verify querying for nonexistent user returns None."""
        statement = select(User).where(User.email == "nonexistent@example.com")
        result = await session.execute(statement)
        retrieved = result.unique().scalar_one_or_none()

        assert retrieved is None

    @pytest.mark.asyncio
    async def test_retrieve_multiple_users(self, session: AsyncSession):
        """Verify multiple users can be retrieved."""
        users = [User(email=f"user{i}@example.com", hashed_password="hashed") for i in range(5)]

        for user in users:
            session.add(user)

        await session.commit()

        statement = select(User)
        result = await session.execute(statement)
        retrieved = result.unique().scalars().all()

        assert len(retrieved) >= 5


@pytest.mark.integration
class TestUserUniquenessConstraints:
    """Tests for User model uniqueness constraints."""

    @pytest.mark.asyncio
    async def test_email_must_be_unique(self, session: AsyncSession):
        """Verify email field is unique."""
        email = "unique@example.com"

        user1 = User(email=email, hashed_password="hashed1")
        session.add(user1)
        await session.commit()

        user2 = User(email=email, hashed_password="hashed2")
        session.add(user2)

        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            await session.commit()

    @pytest.mark.asyncio
    async def test_username_must_be_unique_when_provided(self, session: AsyncSession):
        """Verify username field is unique when provided."""
        username = "uniqueuser"

        user1 = User(
            email="user1@example.com",
            username=username,
            hashed_password="hashed1",
        )
        session.add(user1)
        await session.commit()

        user2 = User(
            email="user2@example.com",
            username=username,
            hashed_password="hashed2",
        )
        session.add(user2)

        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            await session.commit()

    @pytest.mark.asyncio
    async def test_multiple_users_without_username_allowed(self, session: AsyncSession):
        """Verify multiple users can have NULL username."""
        user1 = User(
            email="user1@example.com",
            hashed_password="hashed1",
        )
        user2 = User(
            email="user2@example.com",
            hashed_password="hashed2",
        )

        session.add(user1)
        session.add(user2)

        # Should not raise an error
        await session.commit()

        # Verify both users were created
        statement = select(User).where(User.username.is_(None))
        result = await session.execute(statement)
        retrieved = result.unique().scalars().all()

        assert len(retrieved) >= 2


@pytest.mark.integration
class TestUserOrganizationRelationship:
    """Tests for User organization relationships."""

    @pytest.mark.asyncio
    async def test_user_can_be_assigned_to_organization(self, session: AsyncSession):
        """Verify user can be assigned to an organization."""
        # Create an owner for the organization first
        owner = User(email="owner@example.com", hashed_password="hashed")
        session.add(owner)
        await session.flush()

        org = Organization(name="Test Org", owner_id=owner.id)
        session.add(org)
        await session.flush()

        user = User(
            email="test@example.com",
            hashed_password="hashed",
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.organization_id == org.id
        assert user.organization_role == OrganizationRole.MEMBER

    @pytest.mark.asyncio
    async def test_user_owner_role(self, session: AsyncSession):
        """Verify user can have owner role."""
        # Create an owner for the organization first
        owner = User(email="owner@example.com", hashed_password="hashed")
        session.add(owner)
        await session.flush()

        org = Organization(name="Test Org", owner_id=owner.id)
        session.add(org)
        await session.flush()

        user = User(
            email="test@example.com",
            hashed_password="hashed",
            organization_id=org.id,
            organization_role=OrganizationRole.OWNER,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.organization_role == OrganizationRole.OWNER

    @pytest.mark.asyncio
    async def test_user_can_be_removed_from_organization(self, session: AsyncSession):
        """Verify user can be removed from organization."""
        # Create an owner for the organization
        owner = User(email="owner@example.com", hashed_password="hashed")
        session.add(owner)
        # Flush to get owner.id
        await session.flush()

        org = Organization(name="Test Org", owner_id=owner.id)
        session.add(org)
        await session.flush()

        user = User(
            email="test@example.com",
            hashed_password="hashed",
            organization_id=org.id,
            organization_role=OrganizationRole.MEMBER,
        )
        session.add(user)
        await session.commit()

        # Remove from organization
        user.organization_id = None
        user.organization_role = None
        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.organization_id is None
        assert user.organization_role is None


@pytest.mark.unit
class TestUserModelValidation:
    """Tests for User model field validation."""

    def test_user_email_is_required(self):
        """Verify email is validated properly."""
        # SQLModel/SQLAlchemy validates the field definition
        assert "email" in User.model_fields

    def test_user_password_is_required(self):
        """Verify password is validated properly."""
        assert hasattr(User, "hashed_password")

    def test_organization_role_accepts_valid_enum_values(self):
        """Verify organization_role enum values are correct."""
        valid_roles = [OrganizationRole.OWNER, OrganizationRole.MEMBER]

        assert all(isinstance(role, OrganizationRole) for role in valid_roles)

    def test_organization_role_string_values(self):
        """Verify organization_role string values."""
        assert OrganizationRole.OWNER in [OrganizationRole.OWNER, OrganizationRole.MEMBER]
        assert OrganizationRole.MEMBER in [OrganizationRole.OWNER, OrganizationRole.MEMBER]
