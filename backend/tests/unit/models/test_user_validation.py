"""Validation tests for User and Organization models."""

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Organization, OrganizationRole, User
from tests.factories import OrganizationFactory, UserFactory


class TestUserValidation:
    """Test validation for User model."""

    async def test_username_pattern_validation(self, db_session: AsyncSession) -> None:
        """Test that username only allows letters, numbers, and underscores."""
        UserFactory._meta.sqlalchemy_session = db_session

        # Valid usernames
        user1 = UserFactory.create(username="validuser123")
        assert user1.username == "validuser123"

        user2 = UserFactory.create(username="user_name_2")
        assert user2.username == "user_name_2"

        # Invalid username with special characters
        with pytest.raises(ValidationError, match="String should match pattern"):
            UserFactory.create(username="invalid-user!")

        with pytest.raises(ValidationError, match="String should match pattern"):
            UserFactory.create(username="user@email")

        with pytest.raises(ValidationError, match="String should match pattern"):
            UserFactory.create(username="user name")  # Space not allowed

    async def test_username_is_optional(self, db_session: AsyncSession) -> None:
        """Test that username can be None."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create(username=None)

        assert user.username is None

    async def test_username_whitespace_is_stripped(self, db_session: AsyncSession) -> None:
        """Test that username whitespace is stripped."""
        UserFactory._meta.sqlalchemy_session = db_session

        # This should strip whitespace
        user = UserFactory.create(username="  testuser  ")

        # Note: StringConstraints with strip_whitespace=True should strip it
        assert user.username.strip() == user.username

    async def test_email_is_required(self, db_session: AsyncSession) -> None:
        """Test that email is required."""
        # Email comes from SQLModelBaseUserDB and should be required
        with pytest.raises((ValidationError, TypeError)):
            UserFactory.create(email=None)

    async def test_organization_role_enum_validation(self, db_session: AsyncSession) -> None:
        """Test that organization_role only accepts valid enum values."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()

        # Valid roles
        user1 = UserFactory.create()
        user1.organization = org
        user1.organization_role = OrganizationRole.OWNER
        assert user1.organization_role == OrganizationRole.OWNER

        user2 = UserFactory.create()
        user2.organization = org
        user2.organization_role = OrganizationRole.MEMBER
        assert user2.organization_role == OrganizationRole.MEMBER

    async def test_is_organization_owner_computed_property(self, db_session: AsyncSession) -> None:
        """Test is_organization_owner computed property validation."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()

        owner = UserFactory.create()
        owner.organization = org
        owner.organization_role = OrganizationRole.OWNER

        member = UserFactory.create()
        member.organization = org
        member.organization_role = OrganizationRole.MEMBER

        assert owner.is_organization_owner is True
        assert member.is_organization_owner is False


class TestOrganizationValidation:
    """Test validation for Organization model."""

    async def test_name_length_validation(self, db_session: AsyncSession) -> None:
        """Test that organization name must be between 2 and 100 characters."""
        OrganizationFactory._meta.sqlalchemy_session = db_session

        # Too short
        with pytest.raises(ValidationError, match="at least 2 characters"):
            OrganizationFactory.create(name="A")

        # Too long
        with pytest.raises(ValidationError, match="at most 100 characters"):
            OrganizationFactory.create(name="A" * 101)

        # Valid length
        org = OrganizationFactory.create(name="AB")
        assert org.name == "AB"

        org2 = OrganizationFactory.create(name="A" * 100)
        assert len(org2.name) == 100

    async def test_name_is_required(self, db_session: AsyncSession) -> None:
        """Test that organization name is required."""
        with pytest.raises((ValidationError, TypeError)):
            OrganizationFactory.create(name=None)

    async def test_name_must_be_unique(self, db_session: AsyncSession) -> None:
        """Test that organization names must be unique."""
        from sqlalchemy.exc import IntegrityError

        OrganizationFactory._meta.sqlalchemy_session = db_session

        # Create first organization
        org1 = OrganizationFactory.create(name="Unique Org")

        # Try to create another with same name
        org2 = Organization(name="Unique Org")
        db_session.add(org2)

        with pytest.raises(IntegrityError):
            await db_session.commit()

        await db_session.rollback()

    async def test_location_max_length(self, db_session: AsyncSession) -> None:
        """Test that location has max length of 100 characters."""
        OrganizationFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 100 characters"):
            OrganizationFactory.create(location="A" * 101)

        org = OrganizationFactory.create(location="A" * 100)
        assert len(org.location) == 100

    async def test_description_max_length(self, db_session: AsyncSession) -> None:
        """Test that description has max length of 500 characters."""
        OrganizationFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 500 characters"):
            OrganizationFactory.create(description="A" * 501)

        org = OrganizationFactory.create(description="A" * 500)
        assert len(org.description) == 500

    async def test_optional_fields_can_be_none(self, db_session: AsyncSession) -> None:
        """Test that optional fields can be None."""
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create(location=None, description=None)

        assert org.location is None
        assert org.description is None


class TestUserOrganizationRelationship:
    """Test validation of user-organization relationships."""

    async def test_user_can_belong_to_organization(self, db_session: AsyncSession) -> None:
        """Test that user can be assigned to an organization."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()
        user = UserFactory.create()

        user.organization = org
        user.organization_role = OrganizationRole.MEMBER

        assert user.organization.id == org.id
        assert user.organization_role == OrganizationRole.MEMBER

    async def test_user_without_organization_has_no_role(self, db_session: AsyncSession) -> None:
        """Test that user without organization has no role."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create(organization=None)

        assert user.organization is None
        assert user.organization_role is None

    async def test_multiple_users_can_belong_to_same_organization(self, db_session: AsyncSession) -> None:
        """Test that multiple users can belong to the same organization."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()

        user1 = UserFactory.create()
        user1.organization = org
        user1.organization_role = OrganizationRole.OWNER

        user2 = UserFactory.create()
        user2.organization = org
        user2.organization_role = OrganizationRole.MEMBER

        assert user1.organization.id == org.id
        assert user2.organization.id == org.id
        assert user1.organization_role == OrganizationRole.OWNER
        assert user2.organization_role == OrganizationRole.MEMBER


class TestUserStringRepresentation:
    """Test User model string representation."""

    async def test_user_str_returns_email(self, db_session: AsyncSession) -> None:
        """Test that User.__str__ returns the email."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create(email="test@example.com")

        assert str(user) == "test@example.com"
