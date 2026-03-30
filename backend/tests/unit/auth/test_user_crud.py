"""Unit tests for auth user CRUD functions.

Tests validate_user_create and get_user_by_username directly against a real
database session so we exercise the actual SQL queries, not mocked DB calls.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from app.api.auth.crud.users import get_user_by_username, validate_user_create
from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.schemas import OrganizationCreate, UserCreate, UserCreateWithOrganization
from app.api.auth.sqlmodel_adapter import SQLModelUserDatabaseAsync
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


def _make_user_db(session: AsyncSession) -> SQLModelUserDatabaseAsync:
    """Build a SQLModelUserDatabaseAsync wired to the test session."""
    return SQLModelUserDatabaseAsync(session, User, OAuthAccount)


@pytest.mark.integration
class TestValidateUserCreate:
    """validate_user_create enforces username uniqueness, disposable-email, and org rules."""

    async def test_returns_user_create_unchanged_when_valid(self, session: AsyncSession) -> None:
        """No conflicts or checks → returns the same UserCreate unchanged."""
        user_db = _make_user_db(session)
        user_create = UserCreate(email="fresh@example.com", password="ValidPass1")

        result = await validate_user_create(user_db, user_create)

        assert isinstance(result, UserCreate)
        assert result.email == user_create.email

    async def test_raises_when_username_already_taken(self, session: AsyncSession) -> None:
        """Duplicate username must raise UserNameAlreadyExistsError."""
        await UserFactory.create_async(session, email="first@example.com", username="taken_name")
        user_db = _make_user_db(session)
        user_create = UserCreate(
            email="second@example.com",
            password="ValidPass1",
            username="taken_name",
        )

        with pytest.raises(UserNameAlreadyExistsError):
            await validate_user_create(user_db, user_create)

    async def test_allows_null_username(self, session: AsyncSession) -> None:
        """username=None skips uniqueness check entirely."""
        user_db = _make_user_db(session)
        user_create = UserCreate(email="anon@example.com", password="ValidPass1", username=None)

        result = await validate_user_create(user_db, user_create)

        assert result.username is None

    async def test_raises_for_disposable_email(self, session: AsyncSession) -> None:
        """A disposable email flagged by the checker must raise DisposableEmailError."""
        user_db = _make_user_db(session)
        user_create = UserCreate(email="burner@disposable.com", password="ValidPass1")

        mock_checker = AsyncMock()
        mock_checker.is_disposable.return_value = True

        with pytest.raises(DisposableEmailError):
            await validate_user_create(user_db, user_create, email_checker=mock_checker)

    async def test_skips_disposable_check_when_checker_is_none(self, session: AsyncSession) -> None:
        """No email_checker → disposable check is skipped, validation passes."""
        user_db = _make_user_db(session)
        user_create = UserCreate(email="burner@disposable.com", password="ValidPass1")

        result = await validate_user_create(user_db, user_create, email_checker=None)

        assert result.email == user_create.email

    async def test_converts_user_create_with_org_to_user_create(self, session: AsyncSession) -> None:
        """UserCreateWithOrganization must be reduced to a plain UserCreate (org handled post-creation)."""
        user_db = _make_user_db(session)
        user_create = UserCreateWithOrganization(
            email="orgfounder@example.com",
            password="ValidPass1",
            organization=OrganizationCreate(name="ACME", location="Berlin"),
        )

        result = await validate_user_create(user_db, user_create)

        assert isinstance(result, UserCreate)
        assert not isinstance(result, UserCreateWithOrganization)
        assert result.email == "orgfounder@example.com"


@pytest.mark.integration
class TestGetUserByUsername:
    """get_user_by_username returns the user or raises ValueError."""

    async def test_returns_user_when_found(self, session: AsyncSession) -> None:
        """Existing username → returns the matching User instance."""
        user = await UserFactory.create_async(session, email="user@example.com", username="find_me")

        result = await get_user_by_username(session, "find_me")

        assert result.id == user.id
        assert result.username == "find_me"

    async def test_raises_when_username_not_found(self, session: AsyncSession) -> None:
        """Non-existent username → raises ValueError with descriptive message."""
        with pytest.raises(ValueError, match="not found"):
            await get_user_by_username(session, "ghost_user")
