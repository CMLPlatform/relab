"""Database models related to platform users."""

import uuid  # noqa: TC003 # Used at runtime for ORM mapped annotations
from datetime import datetime  # noqa: TC003 # Used at runtime for ORM mapped annotations
from typing import Any  # noqa: TC003 # Used at runtime for ORM mapped annotations

from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.auth.services.user_database import BaseOAuthAccountDB, BaseUserDB
from app.api.common.models.base import TimeStampMixinBare

# Note: Keeping auth models together avoids circular imports in SQLAlchemy/Pydantic schema building.


### Pydantic base schemas (shared with schemas.py) ###
class UserBase(BaseModel):
    """Base schema for user data. Used by Pydantic schemas only, not ORM."""

    username: str | None = None

    model_config = {"use_enum_values": True}


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

    # Pre-computed public-profile statistics stored as a flexible JSONB snapshot.
    profile_stats: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}", default=dict)
    profile_stats_computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # One-to-many relationship with OAuthAccount
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        back_populates="user",
        lazy="joined",  # Required because of FastAPI-Users OAuth implementation
        foreign_keys="[OAuthAccount.user_id]",
    )

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
