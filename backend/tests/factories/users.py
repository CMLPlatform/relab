"""Factories for user-related models."""

from typing import Any

from factory import Faker, LazyAttribute, SubFactory, post_generation
from factory.alchemy import SQLAlchemyModelFactory

from app.api.auth.models import OAuthAccount, Organization, OrganizationRole, User


class OrganizationFactory(SQLAlchemyModelFactory):
    """Factory for creating Organization instances."""

    class Meta:
        model = Organization
        sqlalchemy_session_persistence = "commit"

    name = Faker("company")
    description = Faker("catch_phrase")


class UserFactory(SQLAlchemyModelFactory):
    """Factory for creating User instances."""

    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    email = Faker("email")
    username = LazyAttribute(lambda obj: Faker("user_name").generate())
    hashed_password = Faker("password")
    is_active = True
    is_superuser = False
    is_verified = True
    organization = None
    organization_role = None

    @post_generation
    def with_organization(obj: User, create: bool, extracted: Any, **kwargs: Any) -> None:
        """Optionally add organization to user.

        Usage:
            user = UserFactory.create(with_organization=True)
            user = UserFactory.create(with_organization=OrganizationFactory())
        """
        if not create:
            return

        if extracted is True:
            # Create new organization
            obj.organization = OrganizationFactory()
            obj.organization_role = OrganizationRole.OWNER
        elif isinstance(extracted, Organization):
            # Use provided organization
            obj.organization = extracted
            obj.organization_role = OrganizationRole.MEMBER


class SuperuserFactory(UserFactory):
    """Factory for creating superuser instances."""

    is_superuser = True
    is_verified = True


class OAuthAccountFactory(SQLAlchemyModelFactory):
    """Factory for creating OAuthAccount instances."""

    class Meta:
        model = OAuthAccount
        sqlalchemy_session_persistence = "commit"

    oauth_name = Faker("random_element", elements=["google", "github"])
    access_token = Faker("sha256")
    account_id = Faker("uuid4")
    account_email = Faker("email")
    user = SubFactory(UserFactory)
