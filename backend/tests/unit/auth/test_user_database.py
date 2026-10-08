"""Unit tests for the user database adapter's unique-username handling."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.auth.exceptions import UserNameAlreadyExistsError
from app.api.auth.models import User
from app.api.auth.services.user_database import UserDatabaseAsync


def _db_failing_commit(message: str) -> UserDatabaseAsync:
    session = MagicMock()
    session.commit = AsyncMock(side_effect=IntegrityError("INSERT INTO user ...", {}, Exception(message)))
    session.refresh = AsyncMock()
    return UserDatabaseAsync(session, User)


USERNAME_RACE = 'duplicate key value violates unique constraint "ix_user_username"'


async def test_create_maps_a_concurrent_username_insert_to_conflict() -> None:
    """Two signups racing for one username: the loser gets the same 409 the pre-check gives."""
    user_db = _db_failing_commit(USERNAME_RACE)

    with pytest.raises(UserNameAlreadyExistsError) as exc_info:
        await user_db.create({"email": "racer@example.com", "hashed_password": "x", "username": "racer"})

    assert exc_info.value.http_status_code == 409


async def test_update_maps_a_concurrent_username_change_to_conflict() -> None:
    """A username change that loses the race to the unique index is a 409, not a 500."""
    user_db = _db_failing_commit(USERNAME_RACE)

    with pytest.raises(UserNameAlreadyExistsError):
        await user_db.update(MagicMock(), {"username": "racer"})


async def test_other_integrity_errors_are_not_reported_as_username_conflicts() -> None:
    """Only the username index maps to the username conflict."""
    user_db = _db_failing_commit('duplicate key value violates unique constraint "ix_user_email"')

    with pytest.raises(IntegrityError):
        await user_db.create({"email": "racer@example.com", "hashed_password": "x", "username": "racer"})
