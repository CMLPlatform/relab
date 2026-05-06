"""Registration, login, logout, and auth rate-limit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi_users.exceptions import UserAlreadyExists
from sqlalchemy import select

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import User
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


pytestmark = pytest.mark.api


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
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert "hashed_password" not in data

    async def test_register_requires_username(self, api_client: AsyncClient) -> None:
        """Password registration requires an explicit username."""
        user_data = {"email": "missing-username@example.com", "password": TEST_PASSWORD}

        response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert "username" in response.text

    async def test_register_duplicate_email(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate email."""
        user_data = {"email": DUPLICATE_EMAIL, "password": TEST_PASSWORD, "username": UNIQUE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

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
                response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"].lower()

    async def test_register_duplicate_canonical_email(self, api_client: AsyncClient) -> None:
        """Canonical-equivalent email registrations should collide."""
        first_user = {"email": "CaseSensitive@Example.com", "password": TEST_PASSWORD, "username": "case_first"}
        second_user = {"email": "casesensitive@example.com", "password": TEST_PASSWORD, "username": "case_second"}

        first_response = await api_client.post("/v1/auth/register", json=first_user)
        second_response = await api_client.post("/v1/auth/register", json=second_user)

        assert first_response.status_code == status.HTTP_201_CREATED
        assert second_response.status_code == status.HTTP_409_CONFLICT

    async def test_register_duplicate_username(self, api_client: AsyncClient) -> None:
        """Test registering with a duplicate username."""
        user_data = {"email": DIFFERENT_EMAIL, "password": TEST_PASSWORD, "username": EXISTING_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = UserNameAlreadyExistsError(user_data["username"])
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "username" in response.json()["detail"].lower()

    async def test_register_disposable_email(self, api_client: AsyncClient) -> None:
        """Test registering with a disposable email."""
        user_data = {"email": DISPOSABLE_EMAIL, "password": TEST_PASSWORD, "username": "tempuser"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = DisposableEmailError(user_data["email"])
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposable" in response.json()["detail"].lower()
        assert user_data["email"] not in response.json()["detail"]

    async def test_register_weak_password(self, api_client: AsyncClient) -> None:
        """Test registering with a weak password."""
        user_data = {"email": "user@example.com", "password": WEAK_PASSWORD, "username": "user"}
        response = await api_client.post("/v1/auth/register", json=user_data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

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
            response = await api_client.post("/v1/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED

    @pytest.mark.parametrize("field_name", ["is_superuser", "is_active", "is_verified"])
    async def test_register_rejects_privileged_fields(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        field_name: str,
    ) -> None:
        """Registration must reject user-control fields instead of relying on safe-mode filtering."""
        email = f"{field_name.replace('_', '-')}@example.com"
        response = await api_client.post(
            "/v1/auth/register",
            json={
                "email": email,
                "password": TEST_PASSWORD,
                "username": f"mass_assignment_{field_name}",
                field_name: True,
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert field_name in response.text
        user = await db_session.scalar(select(User).where(User.email == email))
        assert user is None


class TestLoginEndpoint:
    """Tests for FastAPI-Users login endpoints."""

    async def test_bearer_login_path_returns_refresh_token_without_cookie(self, api_client: AsyncClient) -> None:
        """Bearer login should use an explicit transport path and keep refresh tokens in JSON."""
        user_data = {
            "email": "bearer-path@example.com",
            "password": TEST_PASSWORD,
            "username": "bearer_path_user",
        }
        await api_client.post("/v1/auth/register", json=user_data)

        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["access_token"]
        assert data["refresh_token"]
        assert "refresh_token" not in response.cookies

    async def test_login_with_email_alias(self, api_client: AsyncClient) -> None:
        """Test logging in through the canonical v1 login route."""
        user_data = {"email": "alias@example.com", "password": TEST_PASSWORD, "username": "alias_user"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "access_token" in response.json()

    async def test_login_with_canonical_email_equivalent(self, api_client: AsyncClient) -> None:
        """Login should compare emails through the shared canonical policy."""
        user_data = {"email": "Login.Case@Example.com", "password": TEST_PASSWORD, "username": "login_case"}

        response = await api_client.post("/v1/auth/register", json=user_data)
        assert response.status_code == status.HTTP_201_CREATED

        login_response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": "login.case@example.com", "password": user_data["password"]},
        )

        assert login_response.status_code == status.HTTP_200_OK

    async def test_bearer_login_invalid_credentials(self, api_client: AsyncClient) -> None:
        """Test logging in with invalid credentials."""
        response = await api_client.post(
            "/v1/auth/bearer/login",
            data={"username": INVALID_EMAIL, "password": INVALID_PASSWORD},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_session_cookie_login(self, api_client: AsyncClient) -> None:
        """Test logging in with email and password to get session cookies."""
        user_data = {"email": COOKIE_EMAIL, "password": TEST_PASSWORD, "username": COOKIE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await api_client.post("/v1/auth/register", json=user_data)

        response = await api_client.post(
            "/v1/auth/session/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert len(response.cookies) > 0 or "set-cookie" in response.headers

    async def test_session_logout_clears_browser_storage(self, api_client: AsyncClient) -> None:
        """Session logout should clear cookies and browser-side cached session data."""
        user_data = {
            "email": "session-logout-cleanup@example.com",
            "password": TEST_PASSWORD,
            "username": "session_logout_cleanup",
        }
        await api_client.post("/v1/auth/register", json=user_data)
        login_response = await api_client.post(
            "/v1/auth/session/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )
        assert login_response.status_code == status.HTTP_204_NO_CONTENT

        response = await api_client.post("/v1/auth/session/logout")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.headers["clear-site-data"] == '"cache", "cookies", "storage"'
        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any(header.startswith("auth=") for header in set_cookie_headers)
        assert any(header.startswith("refresh_token=") for header in set_cookie_headers)


class TestLogoutEndpoint:
    """Tests for FastAPI-Users logout endpoints."""

    async def test_logout_unauthenticated(self, api_client: AsyncClient) -> None:
        """Test logging out without credentials."""
        response = await api_client.post("/v1/auth/bearer/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_session_logout(self, api_client: AsyncClient) -> None:
        """Test logging out of session auth."""
        response = await api_client.post("/v1/auth/session/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRateLimiting:
    """Tests for rate limiting on auth endpoints."""

    async def test_login_rate_limit_disabled_in_tests(self, api_client: AsyncClient) -> None:
        """Test that the login endpoint does not enforce rate limits in the test environment."""
        responses = []
        for _ in range(10):
            response = await api_client.post(
                "/v1/auth/bearer/login",
                data={"username": INVALID_EMAIL, "password": "WrongPassword"},
            )
            responses.append(response.status_code)

        assert status.HTTP_429_TOO_MANY_REQUESTS not in responses, f"Rate limiting not disabled: {responses}"
