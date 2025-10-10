"""Database models related to platform users."""

import uuid
from enum import Enum
from functools import cached_property
from typing import TYPE_CHECKING, Annotated, Optional

from fastapi_users_db_sqlmodel import SQLModelBaseOAuthAccount, SQLModelBaseUserDB
from pydantic import UUID4, BaseModel, ConfigDict, StringConstraints
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey
from sqlmodel import Column, Field, Relationship

from app.api.common.models.base import CustomBase, CustomBaseBare, TimeStampMixinBare

if TYPE_CHECKING:
    from app.api.data_collection.models import Product


# TODO: Refactor into separate files for each model.
# This is tricky due to circular imports and the way SQLAlchemy and Pydantic handle schema building.
### Enums ###
class OrganizationRole(str, Enum):
    """Enum for organization roles."""

    OWNER = "owner"
    MEMBER = "member"


### User Model ###
class UserBase(BaseModel):
    """Base schema for user data."""

    username: Annotated[
        str | None,
        StringConstraints(strip_whitespace=True, pattern=r"^[\w]+$"),  # Allows only letters, numbers, and underscores
    ] = Field(index=True, unique=True, default=None)

    model_config = ConfigDict(use_enum_values=True)  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855


class User(UserBase, CustomBaseBare, TimeStampMixinBare, SQLModelBaseUserDB, table=True):
    """Database model for platform users."""

    # One-to-many relationship with OAuthAccount
    oauth_accounts: list["OAuthAccount"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "joined"},  # Required because of FastAPI-Users OAuth implementation
    )
    products: list["Product"] = Relationship(back_populates="owner")

    # Many-to-one relationship with Organization
    organization_id: UUID4 | None = Field(
        default=None,
        sa_column=Column(ForeignKey("organization.id", use_alter=True, name="fk_user_organization"), nullable=True),
    )
    organization: Optional["Organization"] = Relationship(
        back_populates="members", sa_relationship_kwargs={"lazy": "selectin", "foreign_keys": "[User.organization_id]"}
    )
    organization_role: OrganizationRole | None = Field(default=None, sa_column=Column(SAEnum(OrganizationRole)))

    @cached_property
    def is_organization_owner(self) -> bool:
        return self.organization_role == OrganizationRole.OWNER

    def __str__(self) -> str:
        return f"{self.email}"


### OAuthAccount Model ###
class OAuthAccount(SQLModelBaseOAuthAccount, CustomBaseBare, TimeStampMixinBare, table=True):
    """Database model for OAuth accounts. Note that the main implementation is in the base class."""

    # Many-to-one relationship with User
    user: User = Relationship(back_populates="oauth_accounts")


### Organization Model ###
class OrganizationBase(CustomBase):
    """Base schema for organization data."""

    name: str = Field(index=True, unique=True, min_length=2, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class Organization(OrganizationBase, TimeStampMixinBare, table=True):
    """Database model for organizations."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # One-to-one relationship with owner User
    owner_id: UUID4 = Field(
        sa_column=Column(ForeignKey("user.id", use_alter=True, name="fk_organization_owner"), nullable=False),
    )
    owner: User = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"primaryjoin": "Organization.owner_id == User.id", "foreign_keys": "[User.id]"},
    )

    # One-to-many relationship with member Users
    members: list["User"] = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={
            "primaryjoin": "Organization.id == User.organization_id",
            "foreign_keys": "[User.organization_id]",
        },
    )

    def __str__(self) -> str:
        return f"{self.name}"
