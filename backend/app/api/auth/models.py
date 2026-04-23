"""Database models related to platform users."""

import uuid
from datetime import datetime  # noqa: TC003 # Used at runtime for ORM mapped annotations
from enum import StrEnum
from typing import Any  # noqa: TC003 # Used at runtime for ORM mapped annotations

from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.auth.services.user_database import BaseOAuthAccountDB, BaseUserDB
from app.api.common.models.base import Base, TimeStampMixinBare

# Note: Keeping auth models together avoids circular imports in SQLAlchemy/Pydantic schema building.


### Enums ###
class OrganizationRole(StrEnum):
    """Enum for organization roles."""

    OWNER = "owner"
    MEMBER = "member"


### Pydantic base schemas (shared with schemas.py) ###
class UserBase(BaseModel):
    """Base schema for user data. Used by Pydantic schemas only, not ORM."""

    username: str | None = None

    model_config = {"use_enum_values": True}


class OrganizationBase(BaseModel):
    """Base schema for organization data. Used by Pydantic schemas only, not ORM."""

    name: str
    location: str | None = None
    description: str | None = None


class User(BaseUserDB, TimeStampMixinBare):
    """Database model for platform users."""

    # Override __tablename__ from base (both set "user", this is explicit)
    __tablename__ = "user"

    username: Mapped[str | None] = mapped_column(String(50), index=True, unique=True, default=None)

    # Login tracking
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_login_ip: Mapped[str | None] = mapped_column(String(45), default=None)

    # Flexible user preferences (UI settings, feature toggles, etc.)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)

    # Pre-computed statistics (product count, total weight, top categories, etc.)
    stats_cache: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)

    # One-to-many relationship with OAuthAccount
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        back_populates="user",
        lazy="joined",  # Required because of FastAPI-Users OAuth implementation
        foreign_keys="[OAuthAccount.user_id]",
    )

    # Many-to-one relationship with Organization
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organization.id", use_alter=True, name="fk_user_organization"),
        default=None,
    )
    organization: Mapped[Organization | None] = relationship(
        back_populates="members",
        lazy="selectin",
        foreign_keys="[User.organization_id]",
    )
    organization_role: Mapped[OrganizationRole | None] = mapped_column(SAEnum(OrganizationRole), default=None)

    # One-to-one relationship with owned Organization
    owned_organization: Mapped[Organization | None] = relationship(
        back_populates="owner",
        uselist=False,
        foreign_keys="[Organization.owner_id]",
    )

    @property
    def is_organization_owner(self) -> bool:
        """Check if the user is an organization owner."""
        return self.organization_role == OrganizationRole.OWNER

    def __str__(self) -> str:
        return f"{self.email}"


### OAuthAccount Model ###
class OAuthAccount(BaseOAuthAccountDB, TimeStampMixinBare):
    """Database model for OAuth accounts."""

    __tablename__ = "oauthaccount"

    # Redefine user_id to ensure the ForeignKey survives mixin inheritance.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), nullable=False)

    # Many-to-one relationship with User
    user: Mapped[User] = relationship(
        back_populates="oauth_accounts",
        foreign_keys="[OAuthAccount.user_id]",
    )

    __table_args__ = (UniqueConstraint("oauth_name", "account_id", name="uq_oauth_account_identity"),)


### Organization Model ###
class Organization(TimeStampMixinBare, Base):
    """Database model for organizations."""

    __tablename__ = "organization"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), index=True, unique=True)
    location: Mapped[str | None] = mapped_column(String(100), default=None)
    description: Mapped[str | None] = mapped_column(String(500), default=None)

    # One-to-one relationship with owner User
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", use_alter=True, name="fk_organization_owner"), nullable=False
    )
    owner: Mapped[User] = relationship(
        back_populates="owned_organization",
        uselist=False,
        foreign_keys="[Organization.owner_id]",
        post_update=True,
    )

    # One-to-many relationship with member Users
    members: Mapped[list[User]] = relationship(
        back_populates="organization",
        foreign_keys="[User.organization_id]",
    )

    def __str__(self) -> str:
        return f"{self.name}"
