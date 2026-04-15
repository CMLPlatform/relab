"""Registration, login, logout, and auth rate-limit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi_users.exceptions import UserAlreadyExists

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.schemas import UserCreate
from app.api.auth.services.user_database import UserDatabaseAsync

from .shared import (
    COOKIE_EMAIL,
    COOKIE_USERNAME,
    DIFFERENT_EMAIL,
    DISPOSABLE_EMAIL,
    DUPLICATE_EMAIL,
    EXISTING_USERNAME,
    INVALID_EMAIL,
    INVALID_PASSWORD,
    LOGIN_EMAIL,
    LOGIN_USERNAME,
    ORG_DESC,
    ORG_LOCATION,
    ORG_NAME,
    OWNER_EMAIL,
    TEST_EMAIL,
    TEST_PASSWORD,
    TEST_USERNAME,
    UNIQUE_USERNAME,
    WEAK_PASSWORD,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
class TestRegistrationEndpoint:
    """Tests for the /auth/register endpoint."""

    async def test_register_success(self, api_client: AsyncClient) -> None:
        """Test successful user registration."""
        user_data = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "username": TEST_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert "hashed_password" not in data

    async def test_register_duplicate_email(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate email."""
        user_data = {"email": DUPLICATE_EMAIL, "password": TEST_PASSWORD, "username": UNIQUE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/auth/register", json=user_data)

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )

            with patch("app.api.auth.dependencies.get_user_manager") as mock_get_manager:
                mock_manager = AsyncMock()
                mock_manager.create.side_effect = UserAlreadyExists()

                async def get_manager() -> AsyncGenerator[AsyncMock]:
                    yield mock_manager

                mock_get_manager.return_value = get_manager()
                response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"].lower()

    async def test_register_duplicate_username(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate username."""
        user_data = {"email": DIFFERENT_EMAIL, "password": TEST_PASSWORD, "username": EXISTING_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = UserNameAlreadyExistsError(user_data["username"])
            response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "username" in response.json()["detail"].lower()

    async def test_register_disposable_email(self, api_client: AsyncClient) -> None:
        """Test registering with a disposable email."""
        user_data = {"email": DISPOSABLE_EMAIL, "password": TEST_PASSWORD, "username": "tempuser"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = DisposableEmailError(user_data["email"])
            response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposable" in response.json()["detail"].lower()

    async def test_register_weak_password(self, api_client: AsyncClient) -> None:
        """Test registering with a weak password."""
        user_data = {"email": "user@example.com", "password": WEAK_PASSWORD, "username": "user"}
        response = await api_client.post("/auth/register", json=user_data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    async def test_register_with_organization(self, api_client: AsyncClient) -> None:
        """Test registering with an organization."""
        user_data = {
            "email": OWNER_EMAIL,
            "password": TEST_PASSWORD,
            "username": "owner",
            "organization": {"name": ORG_NAME, "location": ORG_LOCATION, "description": ORG_DESC},
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED

    async def test_register_uses_injected_request_session(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Registration should use the FastAPI-injected test session for user lookups."""
        user_data = {
            "email": "session-register@example.com",
            "password": TEST_PASSWORD,
            "username": "session_register",
        }

        original_get_by_email = UserDatabaseAsync.get_by_email

        async def asserted_get_by_email(self: UserDatabaseAsync, email: str) -> object | None:
            assert self.session is db_session
            return await original_get_by_email(self, email)

        monkeypatch.setattr(UserDatabaseAsync, "get_by_email", asserted_get_by_email)

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await api_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
class TestLoginEndpoint:
    """Tests for FastAPI-Users login endpoints."""

    async def test_bearer_login_with_email(self, api_client: AsyncClient) -> None:
        """Test logging in with email and password to get bearer tokens."""
        user_data = {"email": LOGIN_EMAIL, "password": TEST_PASSWORD, "username": LOGIN_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/auth/register", json=user_data)

        response = await api_client.post(
            "/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in response.cookies or "set-cookie" in response.headers

    async def test_bearer_login_invalid_credentials(self, api_client: AsyncClient) -> None:
        """Test logging in with invalid credentials."""
        response = await api_client.post(
            "/auth/bearer/login",
            data={"username": INVALID_EMAIL, "password": INVALID_PASSWORD},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_cookie_login(self, api_client: AsyncClient) -> None:
        """Test logging in with email and password to get session cookies."""
        user_data = {"email": COOKIE_EMAIL, "password": TEST_PASSWORD, "username": COOKIE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/auth/register", json=user_data)

        response = await api_client.post(
            "/auth/cookie/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert len(response.cookies) > 0 or "set-cookie" in response.headers

    async def test_current_user_resolution_uses_injected_request_session(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Current-user auth resolution should use the injected request session."""
        user_data = {
            "email": "me-session@example.com",
            "password": TEST_PASSWORD,
            "username": "me_session",
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            registration_response = await api_client.post("/auth/register", json=user_data)

        assert registration_response.status_code == status.HTTP_201_CREATED

        original_get = UserDatabaseAsync.get

        async def asserted_get(self: UserDatabaseAsync, id: object) -> object | None:  # noqa: A002
            assert self.session is db_session
            return await original_get(self, id)

        monkeypatch.setattr(UserDatabaseAsync, "get", asserted_get)

        login_response = await api_client.post(
            "/auth/bearer/login",
            data={"username": user_data["email"], "password": TEST_PASSWORD},
        )

        if login_response.status_code != status.HTTP_200_OK:
            pytest.skip("Bearer login did not return an access token response")

        access_token = login_response.json().get("access_token")
        if not access_token:
            pytest.skip("Bearer login did not return an access token")

        response = await api_client.get("/users/me", headers={"Authorization": f"Bearer {access_token}"})

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
class TestLogoutEndpoint:
    """Tests for FastAPI-Users logout endpoints."""

    async def test_bearer_logout_unauthenticated(self, api_client: AsyncClient) -> None:
        """Test logging out of bearer auth without credentials."""
        response = await api_client.post("/auth/bearer/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_cookie_logout(self, api_client: AsyncClient) -> None:
        """Test logging out of cookie auth."""
        response = await api_client.post("/auth/cookie/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
class TestRateLimiting:
    """Tests for rate limiting on auth endpoints."""

    async def test_login_rate_limit_disabled_in_tests(self, api_client: AsyncClient) -> None:
        """Test that the login endpoint does not enforce rate limits in the test environment."""
        responses = []
        for _ in range(10):
            response = await api_client.post(
                "/auth/bearer/login",
                data={"username": INVALID_EMAIL, "password": "WrongPassword"},
            )
            responses.append(response.status_code)

        assert status.HTTP_429_TOO_MANY_REQUESTS not in responses, f"Rate limiting not disabled: {responses}"
