"""SQLAlchemy adapter for FastAPI Users.

Provides the base user/OAuth models and async database interface that
FastAPI Users requires.
"""

import uuid
from typing import TYPE_CHECKING, Any, cast

from fastapi_users.models import ID, UP
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy import String, select
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.api.auth.services.email_identity import canonicalize_email
from app.api.common.models.base import Base
from app.core.crypto.sqlalchemy import EncryptedString

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class BaseUserDB(Base):
    """Base user table fields expected by FastAPI Users."""

    __tablename__ = "user"
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    email_canonical: Mapped[str] = mapped_column(
        String,
        unique=True,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(String)

    is_active: Mapped[bool] = mapped_column(default=True)
    is_superuser: Mapped[bool] = mapped_column(default=False)
    is_verified: Mapped[bool] = mapped_column(default=False)

    @validates("email")
    def _set_email_canonical(self, key: str, email: str) -> str:
        """Keep the comparison key synchronized with the delivery address."""
        del key
        self.email_canonical = canonicalize_email(email)
        return email


class BaseOAuthAccountDB(Base):
    """Base OAuth account fields expected by FastAPI Users."""

    __tablename__ = "oauthaccount"
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    oauth_name: Mapped[str] = mapped_column(String, index=True)
    access_token: Mapped[str] = mapped_column(EncryptedString())
    expires_at: Mapped[int | None] = mapped_column(default=None)
    refresh_token: Mapped[str | None] = mapped_column(EncryptedString(), default=None)
    account_id: Mapped[str] = mapped_column(String, index=True)
    account_email: Mapped[str] = mapped_column(String)


class UserDatabaseAsync(SQLAlchemyUserDatabase[UP, ID]):
    """FastAPI-Users SQLAlchemy adapter with ReLab's canonical email lookup."""

    def __init__(
        self,
        session: AsyncSession,
        user_table: type[UP],
        oauth_account_table: type[BaseOAuthAccountDB] | None = None,
    ) -> None:
        super().__init__(session, user_table, cast("Any", oauth_account_table))

    async def get_by_email(self, email: str) -> UP | None:
        """Get a single user by ReLab's canonical email identity."""
        email_canonical_column = cast("Any", self.user_table).email_canonical
        statement = select(self.user_table).where(email_canonical_column == canonicalize_email(email))
        return await self._get_user(statement)
