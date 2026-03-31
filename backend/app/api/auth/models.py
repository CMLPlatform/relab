"""Database models related to platform users."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Optional

from pydantic import UUID4, BaseModel, ConfigDict
from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, Relationship, SQLModel

from app.api.auth.services.sqlmodel_user_database import SQLModelBaseOAuthAccount, SQLModelBaseUserDB
from app.api.common.models.base import TimeStampMixinBare

# Note: Keeping auth models together avoids circular imports in SQLAlchemy/Pydantic schema building.


### Enums ###
class OrganizationRole(StrEnum):
    """Enum for organization roles."""

    OWNER = "owner"
    MEMBER = "member"


### User Model ###
class UserBase(BaseModel):
    """Base schema for user data."""

    username: str | None = Field(index=True, unique=True, default=None, min_length=2, max_length=50)

    model_config = ConfigDict(use_enum_values=True)


class User(SQLModelBaseUserDB, UserBase, TimeStampMixinBare, table=True):
    """Database model for platform users."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # Login tracking
    last_login_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    last_login_ip: str | None = Field(default=None, max_length=45, nullable=True)  # Max 45 for IPv6

    # One-to-many relationship with OAuthAccount
    oauth_accounts: list["OAuthAccount"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "joined",  # Required because of FastAPI-Users OAuth implementation
            "foreign_keys": "[OAuthAccount.user_id]",
        },
    )
    # Many-to-one relationship with Organization
    organization_id: UUID4 | None = Field(
        default=None,
        sa_column=Column(
            ForeignKey("organization.id", use_alter=True, name="fk_user_organization"),
            nullable=True,
        ),
    )
    organization: Optional["Organization"] = Relationship(  # `Optional` and quotes needed for proper sqlalchemy mapping
        back_populates="members",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[User.organization_id]",
        },
    )
    organization_role: OrganizationRole | None = Field(default=None, sa_column=Column(SAEnum(OrganizationRole)))

    # One-to-one relationship with owned Organization
    owned_organization: Optional["Organization"] = (
        Relationship(  # `Optional` and quotes needed for proper sqlalchemy mapping
            back_populates="owner",
            sa_relationship_kwargs={
                "uselist": False,
                "foreign_keys": "[Organization.owner_id]",
            },
        )
    )

    @property
    def is_organization_owner(self) -> bool:
        """Check if the user is an organization owner."""
        return self.organization_role == OrganizationRole.OWNER

    def __str__(self) -> str:
        return f"{self.email}"


### OAuthAccount Model ###
class OAuthAccount(SQLModelBaseOAuthAccount, TimeStampMixinBare, table=True):
    """Database model for OAuth accounts. Note that the main implementation is in the base class."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # Redefine user_id to ensure the ForeignKey survives mixin inheritance.
    user_id: UUID4 = Field(foreign_key="user.id", nullable=False)

    # Many-to-one relationship with User
    user: User = Relationship(
        back_populates="oauth_accounts",
        sa_relationship_kwargs={"foreign_keys": "[OAuthAccount.user_id]"},
    )
    __table_args__ = (UniqueConstraint("oauth_name", "account_id", name="uq_oauth_account_identity"),)


### Organization Model ###
class OrganizationBase(SQLModel):
    """Base schema for organization data."""

    name: str = Field(index=True, unique=True, min_length=2, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class Organization(OrganizationBase, TimeStampMixinBare, table=True):
    """Database model for organizations."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # One-to-one relationship with owner User
    # Use sa_column with explicit ForeignKey to preserve constraint through mixin inheritance
    owner_id: UUID4 = Field(
        sa_column=Column(ForeignKey("user.id", use_alter=True, name="fk_organization_owner"), nullable=False)
    )
    owner: User = Relationship(
        back_populates="owned_organization",
        sa_relationship_kwargs={"uselist": False, "foreign_keys": "[Organization.owner_id]", "post_update": True},
    )

    # One-to-many relationship with member Users
    members: list[User] = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"foreign_keys": "[User.organization_id]"},
    )

    def __str__(self) -> str:
        return f"{self.name}"
