"""Local SQLModel adapter for FastAPI Users.

This keeps RELab independent from the archived ``fastapi-users-db-sqlmodel``
package while preserving the small API surface we actually use.
"""
# spell-checker: ignore UOAP

import uuid
from typing import TYPE_CHECKING, Any, cast

from fastapi_users.db.base import BaseUserDatabase
from fastapi_users.models import ID, OAP, UOAP, UP
from pydantic import UUID4, ConfigDict, EmailStr
from sqlalchemy.orm import QueryableAttribute, selectinload
from sqlmodel import AutoString, Field, SQLModel, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from collections.abc import Mapping


class SQLModelBaseUserDB(SQLModel):
    """Base SQLModel user table fields expected by FastAPI Users."""

    __tablename__ = "user"

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    if TYPE_CHECKING:  # pragma: no cover
        email: str
    else:
        email: EmailStr = Field(
            sa_column_kwargs={"unique": True, "index": True},
            nullable=False,
            sa_type=AutoString,
        )
    hashed_password: str

    is_active: bool = Field(default=True, nullable=False)
    is_superuser: bool = Field(default=False, nullable=False)
    is_verified: bool = Field(default=False, nullable=False)

    model_config = ConfigDict(from_attributes=True)


class SQLModelBaseOAuthAccount(SQLModel):
    """Base SQLModel OAuth account fields expected by FastAPI Users."""

    __tablename__ = "oauthaccount"

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: UUID4 = Field(foreign_key="user.id", nullable=False)
    oauth_name: str = Field(index=True, nullable=False)
    access_token: str = Field(nullable=False)
    expires_at: int | None = Field(nullable=True)
    refresh_token: str | None = Field(nullable=True)
    account_id: str = Field(index=True, nullable=False)
    account_email: str = Field(nullable=False)

    model_config = ConfigDict(from_attributes=True)


class OAuthAccountWithUser(SQLModelBaseOAuthAccount):
    """Typing helper for OAuth account models that expose a ``user`` relationship."""

    user: Any


class SQLModelUserDatabaseAsync(BaseUserDatabase[UP, ID]):
    """Async SQLModel user adapter for FastAPI Users."""

    session: AsyncSession
    user_model: type[UP]
    oauth_account_model: type[SQLModelBaseOAuthAccount] | None

    def __init__(
        self,
        session: AsyncSession,
        user_model: type[UP],
        oauth_account_model: type[SQLModelBaseOAuthAccount] | None = None,
    ) -> None:
        self.session = session
        self.user_model = user_model
        self.oauth_account_model = oauth_account_model

    async def get(self, id: ID) -> UP | None:  # noqa: A002
        """Get a single user by ID."""
        return await self.session.get(self.user_model, id)

    async def get_by_email(self, email: str) -> UP | None:
        """Get a single user by email."""
        statement = select(self.user_model).where(func.lower(self.user_model.email) == func.lower(email))
        results = await self.session.exec(statement)
        return results.unique().one_or_none()

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
        results = await self.session.exec(statement)
        oauth_account = results.unique().one_or_none()
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
