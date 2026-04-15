"""SQLAlchemy adapter for FastAPI Users.

Provides the base user/OAuth models and async database interface that
FastAPI Users requires.
"""
# spell-checker: ignore UOAP

import uuid
from typing import TYPE_CHECKING, Annotated, Any, cast

from fastapi import Depends
from fastapi_users.db.base import BaseUserDatabase
from fastapi_users.models import ID, OAP, UOAP, UP
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, QueryableAttribute, mapped_column, selectinload

from app.api.common.models.base import Base

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Mapping

    from pydantic import UUID4

    from app.api.auth.models import User


class BaseUserDB(Base):
    """Base user table fields expected by FastAPI Users."""

    __tablename__ = "user"
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)

    is_active: Mapped[bool] = mapped_column(default=True)
    is_superuser: Mapped[bool] = mapped_column(default=False)
    is_verified: Mapped[bool] = mapped_column(default=False)


class BaseOAuthAccountDB(Base):
    """Base OAuth account fields expected by FastAPI Users."""

    __tablename__ = "oauthaccount"
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    oauth_name: Mapped[str] = mapped_column(String, index=True)
    access_token: Mapped[str] = mapped_column(String)
    expires_at: Mapped[int | None] = mapped_column(default=None)
    refresh_token: Mapped[str | None] = mapped_column(default=None)
    account_id: Mapped[str] = mapped_column(String, index=True)
    account_email: Mapped[str] = mapped_column(String)


class OAuthAccountWithUser(BaseOAuthAccountDB):
    """Typing helper for OAuth account models that expose a ``user`` relationship."""

    __abstract__ = True
    user: Any


class UserDatabaseAsync(BaseUserDatabase[UP, ID]):
    """Async SQLAlchemy user adapter for FastAPI Users."""

    session: AsyncSession
    user_model: type[UP]
    oauth_account_model: type[BaseOAuthAccountDB] | None

    def __init__(
        self,
        session: AsyncSession,
        user_model: type[UP],
        oauth_account_model: type[BaseOAuthAccountDB] | None = None,
    ) -> None:
        self.session = session
        self.user_model = user_model
        self.oauth_account_model = oauth_account_model

    async def get(self, id: ID) -> UP | None:  # noqa: A002 # Reuse FastAPI Users' "id" parameter name for compatibility
        """Get a single user by ID."""
        return await self.session.get(self.user_model, id)

    async def get_by_email(self, email: str) -> UP | None:
        """Get a single user by email."""
        statement = select(self.user_model).where(func.lower(self.user_model.email) == func.lower(email))
        results = await self.session.execute(statement)
        return results.scalars().unique().one_or_none()

    async def get_by_oauth_account(self, oauth: str, account_id: str) -> UP | None:
        """Get a single user by OAuth account ID."""
        if self.oauth_account_model is None:
            raise NotImplementedError

        oauth_account_model = cast("type[OAuthAccountWithUser]", self.oauth_account_model)
        statement = (
            select(oauth_account_model)
            .where(oauth_account_model.oauth_name == oauth)
            .where(oauth_account_model.account_id == account_id)
            .options(selectinload(cast("QueryableAttribute[Any]", oauth_account_model.user)))
        )
        results = await self.session.execute(statement)
        oauth_account = results.scalars().unique().one_or_none()
        if oauth_account:
            return cast("UP", oauth_account.user)
        return None

    async def create(self, create_dict: Mapping[str, Any]) -> UP:
        """Create a user."""
        user = self.user_model(**dict(create_dict))
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def update(self, user: UP, update_dict: Mapping[str, Any]) -> UP:
        """Update a user in place."""
        for key, value in update_dict.items():
            setattr(user, key, value)
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def delete(self, user: UP) -> None:
        """Delete a user."""
        await self.session.delete(user)
        await self.session.commit()

    async def add_oauth_account(self, user: UOAP, create_dict: dict[str, Any]) -> UOAP:
        """Attach an OAuth account to a user."""
        if self.oauth_account_model is None:
            raise NotImplementedError

        oauth_account = self.oauth_account_model(**dict(create_dict))
        user.oauth_accounts.append(oauth_account)
        self.session.add(user)
        await self.session.commit()
        return user

    async def update_oauth_account(self, user: UOAP, oauth_account: OAP, update_dict: dict[str, Any]) -> UOAP:
        """Update an existing OAuth account."""
        if self.oauth_account_model is None:
            raise NotImplementedError

        for key, value in update_dict.items():
            setattr(oauth_account, key, value)
        self.session.add(oauth_account)
        await self.session.commit()
        return user


async def get_auth_async_session() -> AsyncGenerator[AsyncSession]:
    """Yield the shared async database session for auth request dependencies."""
    from app.core.database import get_async_session  # noqa: PLC0415

    async for session in get_async_session():
        yield session


async def get_user_db(
    session: Annotated[AsyncSession, Depends(get_auth_async_session)],
) -> AsyncGenerator[UserDatabaseAsync[User, UUID4]]:
    """Build the FastAPI Users database adapter from the shared DB session."""
    from app.api.auth.models import OAuthAccount, User  # noqa: PLC0415

    yield UserDatabaseAsync(session, User, OAuthAccount)
