"""User update validation and endpoint tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

import pytest
from fastapi import status

from app.api.auth.crud.users import update_user_override
from app.api.auth.exceptions import UserNameAlreadyExistsError
from app.api.auth.schemas import UserUpdate
from tests.factories.models import UserFactory

from .shared import NEW_USERNAME, TAKEN_USERNAME, USER1_EMAIL, USER1_USERNAME, USER2_EMAIL, USER2_USERNAME

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


class TestUpdateUserValidation:
    """Integration tests for update_user_override() username uniqueness logic."""

    async def test_update_username_to_available_name_succeeds(self, db_session: AsyncSession) -> None:
        """Updating to an available username should succeed."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
        )
        user_db = MagicMock()
        user_db.session = db_session
        result = await update_user_override(user_db, user, UserUpdate(username=NEW_USERNAME))
        assert result.username == NEW_USERNAME

    async def test_update_username_to_same_name_succeeds(self, db_session: AsyncSession) -> None:
        """Updating to the same username should succeed."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
        )
        user_db = MagicMock()
        user_db.session = db_session
        result = await update_user_override(user_db, user, UserUpdate(username=USER1_USERNAME))
        assert result.username == USER1_USERNAME

    async def test_update_username_to_taken_name_raises(self, db_session: AsyncSession) -> None:
        """Updating to a taken username should raise an error."""
        await UserFactory.create_async(db_session, email=USER1_EMAIL, username=TAKEN_USERNAME, hashed_password="pw")
        user2 = await UserFactory.create_async(
            db_session,
            email=USER2_EMAIL,
            username=USER2_USERNAME,
            hashed_password="pw",
        )
        user_db = MagicMock()
        user_db.session = db_session

        with pytest.raises(UserNameAlreadyExistsError):
            await update_user_override(user_db, user2, UserUpdate(username=TAKEN_USERNAME))

    async def test_update_without_username_change_passes_through(self, db_session: AsyncSession) -> None:
        """Updating without changing the username should pass through."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
        )
        user_db = MagicMock()
        user_db.session = db_session
        result = await update_user_override(user_db, user, UserUpdate(username=None))
        assert result.username is None


class TestUpdateUserEndpoint:
    """Integration tests for the user update API endpoint."""

    async def test_update_user_unauthenticated_returns_401(self, api_client: AsyncClient) -> None:
        """Test that updating a user without authentication returns 401."""
        response = await api_client.patch("/users/me", json={"username": "any_name"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_me_unauthenticated_returns_401(self, api_client: AsyncClient) -> None:
        """Test that getting user info without authentication returns 401."""
        response = await api_client.get("/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
