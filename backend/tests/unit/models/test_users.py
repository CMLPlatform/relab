"""Unit tests for user models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Organization, OrganizationRole, User
from tests.factories import OrganizationFactory, UserFactory


class TestUser:
    """Test User model."""

    async def test_create_user(self, db_session: AsyncSession) -> None:
        """Test creating a basic user."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()

        assert user.id is not None
        assert user.email is not None
        assert user.is_active is True
        assert user.is_verified is True

    async def test_user_with_organization(self, db_session: AsyncSession) -> None:
        """Test user with organization."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create(with_organization=True)

        assert user.organization is not None
        assert user.organization_role == OrganizationRole.OWNER

    async def test_user_is_organization_owner(self, db_session: AsyncSession) -> None:
        """Test user is_organization_owner property."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        owner = UserFactory.create(with_organization=True)
        assert owner.is_organization_owner is True

        # Create member of same organization
        org = owner.organization
        member = UserFactory.create()
        member.organization = org
        member.organization_role = OrganizationRole.MEMBER

        assert member.is_organization_owner is False

    async def test_user_without_organization(self, db_session: AsyncSession) -> None:
        """Test user without organization."""
        UserFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()

        assert user.organization is None
        assert user.organization_role is None


class TestOrganization:
    """Test Organization model."""

    async def test_create_organization(self, db_session: AsyncSession) -> None:
        """Test creating an organization."""
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()

        assert org.id is not None
        assert org.name is not None

    async def test_organization_with_members(self, db_session: AsyncSession) -> None:
        """Test organization with multiple members."""
        UserFactory._meta.sqlalchemy_session = db_session
        OrganizationFactory._meta.sqlalchemy_session = db_session

        org = OrganizationFactory.create()
        user1 = UserFactory.create()
        user1.organization = org
        user1.organization_role = OrganizationRole.OWNER

        user2 = UserFactory.create()
        user2.organization = org
        user2.organization_role = OrganizationRole.MEMBER

        # Verify relationships
        assert user1.organization.id == org.id
        assert user2.organization.id == org.id
        assert user1.organization_role == OrganizationRole.OWNER
        assert user2.organization_role == OrganizationRole.MEMBER
