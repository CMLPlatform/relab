"""Integration tests for auth user CRUD functions.

Tests validate_user_create and get_user_by_username directly against a real
database session so we exercise the actual SQL queries, not mocked DB calls.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase

from app.api.auth.crud.users import get_user_by_username, validate_user_create
from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.schemas import UserCreate
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.common.exceptions import NotFoundError
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.db
VALID_TEST_PASSWORD = "correct-horse-battery-staple-v42"


def _make_user_db(db_session: AsyncSession) -> UserDatabaseAsync:
    """Build a UserDatabaseAsync wired to the test session."""
    return UserDatabaseAsync(db_session, User, OAuthAccount)


class TestValidateUserCreate:
    """validate_user_create enforces username uniqueness, disposable-email, and org rules."""

    async def test_returns_user_create_unchanged_when_valid(self, db_session: AsyncSession) -> None:
        """No conflicts or checks → returns the same UserCreate unchanged."""
        user_db = _make_user_db(db_session)
        user_create = UserCreate(email="fresh@example.com", password=VALID_TEST_PASSWORD)

        result = await validate_user_create(user_db, user_create)

        assert isinstance(result, UserCreate)
        assert result.email == user_create.email

    async def test_raises_when_username_already_taken(self, db_session: AsyncSession) -> None:
        """Duplicate username must raise UserNameAlreadyExistsError."""
        await UserFactory.create_async(db_session, email="first@example.com", username="taken_name")
        user_db = _make_user_db(db_session)
        user_create = UserCreate(
            email="second@example.com",
            password=VALID_TEST_PASSWORD,
            username="taken_name",
        )

        with pytest.raises(UserNameAlreadyExistsError):
            await validate_user_create(user_db, user_create)

    async def test_allows_null_username(self, db_session: AsyncSession) -> None:
        """username=None skips uniqueness check entirely."""
        user_db = _make_user_db(db_session)
        user_create = UserCreate(email="anon@example.com", password=VALID_TEST_PASSWORD, username=None)

        result = await validate_user_create(user_db, user_create)

        assert result.username is None

    async def test_raises_for_disposable_email(self, db_session: AsyncSession) -> None:
        """A disposable email flagged by the checker must raise DisposableEmailError."""
        user_db = _make_user_db(db_session)
        user_create = UserCreate(email="burner@disposable.com", password=VALID_TEST_PASSWORD)

        mock_checker = AsyncMock()
        mock_checker.is_disposable.return_value = True

        with pytest.raises(DisposableEmailError):
            await validate_user_create(user_db, user_create, email_checker=mock_checker)

    async def test_skips_disposable_check_when_checker_is_none(self, db_session: AsyncSession) -> None:
        """No email_checker → disposable check is skipped, validation passes."""
        user_db = _make_user_db(db_session)
        user_create = UserCreate(email="burner@disposable.com", password=VALID_TEST_PASSWORD)

        result = await validate_user_create(user_db, user_create, email_checker=None)

        assert result.email == user_create.email

    def test_rejects_removed_organization_fields(self) -> None:
        """User creation no longer accepts organization fields."""
        with pytest.raises(ValueError, match="organization"):
            UserCreate(
                email="orgfounder@example.com",
                password=VALID_TEST_PASSWORD,
                organization_id="1fa85f64-5717-4562-b3fc-2c963f66afa6",
            )


class TestUserDatabaseEmailLookup:
    """User email lookup uses the shared canonical identity key."""

    def test_user_database_uses_official_sqlalchemy_adapter(self, db_session: AsyncSession) -> None:
        """The local adapter should extend, not duplicate, FastAPI-Users SQLAlchemy CRUD."""
        user_db = _make_user_db(db_session)

        assert isinstance(user_db, SQLAlchemyUserDatabase)

    async def test_get_by_email_matches_canonical_equivalent(self, db_session: AsyncSession) -> None:
        """Different casing should resolve to the same stored user."""
        user = await UserFactory.create_async(
            db_session,
            email="Researcher.Name@Example.COM",
            username="canonical_lookup",
        )
        user_db = _make_user_db(db_session)

        result = await user_db.get_by_email("researcher.name@example.com")

        assert result is not None
        assert result.id == user.id


class TestGetUserByUsername:
    """get_user_by_username returns the user or raises NotFoundError."""

    async def test_returns_user_when_found(self, db_session: AsyncSession) -> None:
        """Existing username → returns the matching User instance."""
        user = await UserFactory.create_async(db_session, email="user@example.com", username="find_me")

        result = await get_user_by_username(db_session, "find_me")

        assert result.id == user.id
        assert result.username == "find_me"

    async def test_raises_when_username_not_found(self, db_session: AsyncSession) -> None:
        """Non-existent username → raises NotFoundError with descriptive message."""
        with pytest.raises(NotFoundError, match="not found"):
            await get_user_by_username(db_session, "ghost_user")
