"""User update validation and endpoint tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from pydantic import ValidationError

from app.api.auth.crud.users import update_user_override
from app.api.auth.exceptions import UserNameAlreadyExistsError
from app.api.auth.schemas import UserUpdate
from app.api.auth.services.email_identity import canonicalize_email
from app.api.common.exceptions import BadRequestError
from tests.factories.models import UserFactory

from .shared import (
    NEW_USERNAME,
    TAKEN_USERNAME,
    TEST_PASSWORD,
    USER1_EMAIL,
    USER1_USERNAME,
    USER2_EMAIL,
    USER2_USERNAME,
    hash_test_password,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.api
UPDATED_PASSWORD = "updated-test-credential-42"


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

    async def test_update_username_from_null_succeeds(self, db_session: AsyncSession) -> None:
        """Incomplete OAuth users can choose their username during onboarding."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=None,
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
        result = await update_user_override(user_db, user, UserUpdate())
        assert result.username is None

    async def test_update_username_to_null_raises(self, db_session: AsyncSession) -> None:
        """Username can be changed but cannot be cleared."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
        )
        user_db = MagicMock()
        user_db.session = db_session

        with pytest.raises(BadRequestError, match="Username cannot be cleared"):
            await update_user_override(user_db, user, UserUpdate(username=None))

    async def test_update_preferences_merges_with_existing_typed_values(self, db_session: AsyncSession) -> None:
        """Preference updates should merge into the existing persisted JSON payload."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
            preferences={"profile_visibility": "private"},
        )
        user_db = MagicMock()
        user_db.session = db_session

        result = await update_user_override(
            user_db,
            user,
            UserUpdate.model_validate({"preferences": {"theme_mode": "dark"}}),
        )

        assert result.preferences == {
            "profile_visibility": "private",
            "theme_mode": "dark",
            "email_updates_enabled": False,
            "products_welcome_dismissed": False,
            "rpi_camera_enabled": False,
            "youtube_streaming_enabled": False,
        }

    async def test_update_preferences_can_enable_email_updates(self, db_session: AsyncSession) -> None:
        """Preference updates should persist the recurring email opt-in flag."""
        user = await UserFactory.create_async(
            db_session,
            email=USER1_EMAIL,
            username=USER1_USERNAME,
            hashed_password="pw",
            preferences={"theme_mode": "light"},
        )
        user_db = MagicMock()
        user_db.session = db_session

        result = await update_user_override(
            user_db,
            user,
            UserUpdate.model_validate({"preferences": {"email_updates_enabled": True}}),
        )

        assert result.preferences == {
            "profile_visibility": "public",
            "theme_mode": "light",
            "email_updates_enabled": True,
            "products_welcome_dismissed": False,
            "rpi_camera_enabled": False,
            "youtube_streaming_enabled": False,
        }

    def test_update_preferences_rejects_invalid_theme_mode(self) -> None:
        """Preference validation should reject unsupported theme values."""
        with pytest.raises(ValidationError):
            UserUpdate.model_validate({"preferences": {"theme_mode": "sepia"}})


class TestUpdateUserEndpoint:
    """Integration tests for the user update API endpoint."""

    async def test_update_user_unauthenticated_returns_401(self, api_client: AsyncClient) -> None:
        """Test that updating a user without authentication returns 401."""
        response = await api_client.patch("/v1/users/me", json={"username": "any_name"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_me_unauthenticated_returns_401(self, api_client: AsyncClient) -> None:
        """Test that getting user info without authentication returns 401."""
        response = await api_client.get("/v1/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_password_update_requires_current_password(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Password changes through the self-management endpoint require reauthentication."""
        user = await UserFactory.create_async(
            db_session,
            email="reauth-required@example.com",
            username="reauth_required",
            hashed_password=hash_test_password(TEST_PASSWORD),
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        response = await api_client.patch(
            "/v1/users/me",
            json={"password": UPDATED_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "current password" in response.json()["detail"].lower()

    async def test_password_update_accepts_valid_current_password(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """A valid current password allows a password change."""
        user = await UserFactory.create_async(
            db_session,
            email="reauth-valid@example.com",
            username="reauth_valid",
            hashed_password=hash_test_password(TEST_PASSWORD),
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        response = await api_client.patch(
            "/v1/users/me",
            json={
                "password": UPDATED_PASSWORD,
                "current_password": TEST_PASSWORD,
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == status.HTTP_200_OK

    async def test_username_update_does_not_require_current_password(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """Non-sensitive updates keep working without a current password."""
        user = await UserFactory.create_async(
            db_session,
            email="reauth-username@example.com",
            username="reauth_username",
            hashed_password=hash_test_password(TEST_PASSWORD),
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        response = await api_client.patch(
            "/v1/users/me",
            json={"username": "reauth_username_new"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["username"] == "reauth_username_new"

    @pytest.mark.parametrize(
        ("field_name", "value"),
        [
            ("is_superuser", True),
            ("is_active", False),
            ("is_verified", True),
        ],
    )
    async def test_update_me_rejects_privileged_fields_without_mutating_user(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        field_name: str,
        value: object,
    ) -> None:
        """Self-service updates must reject account-control fields at request validation."""
        user = await UserFactory.create_async(
            db_session,
            email=f"mass-assignment-{field_name.replace('_', '-')}@example.com",
            username=f"mass_assignment_{field_name}",
            hashed_password=hash_test_password(TEST_PASSWORD),
            is_active=True,
            is_superuser=False,
            is_verified=False,
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        response = await api_client.patch(
            "/v1/users/me",
            json={field_name: value},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert field_name in response.text
        await db_session.refresh(user)
        assert user.is_active is True
        assert user.is_superuser is False
        assert user.is_verified is False

    async def test_email_update_verifies_new_address_and_notifies_old_address(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        mock_email_sending: AsyncMock,
    ) -> None:
        """Changing email should update canonical identity and run both safety notifications."""
        old_email = "old-address@example.com"
        new_email = "New-Address@Example.com"
        user = await UserFactory.create_async(
            db_session,
            email=old_email,
            username="email_update_user",
            hashed_password=hash_test_password(TEST_PASSWORD),
            is_verified=True,
        )
        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user.email, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        response = await api_client.patch(
            "/v1/users/me",
            json={"email": new_email, "current_password": TEST_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["email"] == "New-Address@example.com"
        assert response.json()["is_verified"] is False
        await db_session.refresh(user)
        assert user.email_canonical == canonicalize_email(new_email)

        email_mock = mock_email_sending
        assert email_mock.await_count == 2
        sent_to = [call.args[0].recipients[0].email for call in email_mock.await_args_list]
        assert sent_to == ["New-Address@example.com", old_email]
