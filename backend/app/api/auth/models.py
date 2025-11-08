"""Database models related to platform users."""

import uuid
from enum import Enum
from functools import cached_property
from typing import TYPE_CHECKING, Optional

from fastapi_users_db_sqlmodel import SQLModelBaseOAuthAccount, SQLModelBaseUserDB
from pydantic import UUID4, BaseModel, ConfigDict
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

    username: str | None = Field(index=True, unique=True, default=None, min_length=2, max_length=50)

    model_config = ConfigDict(use_enum_values=True)  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855


class User(SQLModelBaseUserDB, CustomBaseBare, UserBase, TimeStampMixinBare, table=True):
    """Database model for platform users."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo (see https://github.com/fastapi/sqlmodel/issues/1623)
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # One-to-many relationship with OAuthAccount
    oauth_accounts: list["OAuthAccount"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "joined",  # Required because of FastAPI-Users OAuth implementation
            "primaryjoin": "User.id == OAuthAccount.user_id",  # HACK: Explicitly define join condition because of
            "foreign_keys": "[OAuthAccount.user_id]",  # pydantic / sqlmodel issues (see https://github.com/fastapi/sqlmodel/issues/1623)
        },  # TODO: Check if this is fixed in future versions of pydantic/sqlmodel and we can use automatic
        # relationship detection again
    )
    products: list["Product"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={
            "primaryjoin": "User.id == Product.owner_id",  # HACK: Explicitly define join condition because of
            "foreign_keys": "[Product.owner_id]",  # pydantic / sqlmodel issues
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
    organization: Optional["Organization"] = Relationship(
        back_populates="members",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "primaryjoin": "User.organization_id == Organization.id",  # HACK: Explicitly define join condition because of
            "foreign_keys": "[User.organization_id]",  # pydantic / sqlmodel issues
        },
    )
    organization_role: OrganizationRole | None = Field(default=None, sa_column=Column(SAEnum(OrganizationRole)))

    # One-to-one relationship with owned Organization
    owned_organization: Optional["Organization"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={
            "uselist": False,
            "primaryjoin": "User.id == Organization.owner_id",  # HACK: Explicitly define join condition because of
            "foreign_keys": "[Organization.owner_id]",  # pydantic / sqlmodel issues
        },
    )

    @cached_property
    def is_organization_owner(self) -> bool:
        return self.organization_role == OrganizationRole.OWNER

    def __str__(self) -> str:
        return f"{self.email}"


### OAuthAccount Model ###
class OAuthAccount(SQLModelBaseOAuthAccount, CustomBaseBare, TimeStampMixinBare, table=True):
    """Database model for OAuth accounts. Note that the main implementation is in the base class."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # HACK: Redefine user_id to ensure ForeignKey is preserved despite mixin interference
    user_id: UUID4 = Field(foreign_key="user.id", nullable=False)

    # Many-to-one relationship with User
    user: User = Relationship(
        back_populates="oauth_accounts",
        sa_relationship_kwargs={  # HACK: Explicitly define join condition because of pydantic / sqlmodel issues
            "primaryjoin": "OAuthAccount.user_id == User.id",  # (see https://github.com/fastapi/sqlmodel/issues/1623)
            "foreign_keys": "[OAuthAccount.user_id]",
        },
    )


### Organization Model ###
class OrganizationBase(CustomBase):
    """Base schema for organization data."""

    name: str = Field(index=True, unique=True, min_length=2, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class Organization(OrganizationBase, TimeStampMixinBare, table=True):
    """Database model for organizations."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    # One-to-one relationship with owner User
    # Use sa_column with explicit ForeignKey to preserve constraint through mixin inheritance
    owner_id: UUID4 = Field(
        sa_column=Column(ForeignKey("user.id", use_alter=True, name="fk_organization_owner"), nullable=False)
    )
    owner: User = Relationship(
        back_populates="owned_organization",
        sa_relationship_kwargs={
            "uselist": False,
            "primaryjoin": "Organization.owner_id == User.id",  # HACK: Explicitly define join condition because of
            "foreign_keys": "[Organization.owner_id]",  # pydantic / sqlmodel issues
        },
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
