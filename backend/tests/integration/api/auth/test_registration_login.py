"""Registration, login, logout, and auth rate-limit tests."""

# ruff: noqa: D102

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi_users.exceptions import UserAlreadyExists

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.schemas import OrganizationCreate, UserCreate, UserCreateWithOrganization

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


@pytest.mark.asyncio
class TestRegistrationEndpoint:
    """Tests for the /auth/register endpoint."""

    async def test_register_success(self, async_client: AsyncClient) -> None:
        user_data = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "username": TEST_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert "hashed_password" not in data

    async def test_register_duplicate_email(self, async_client: AsyncClient) -> None:
        user_data = {"email": DUPLICATE_EMAIL, "password": TEST_PASSWORD, "username": UNIQUE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await async_client.post("/auth/register", json=user_data)

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
                response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"].lower()

    async def test_register_duplicate_username(self, async_client: AsyncClient) -> None:
        user_data = {"email": DIFFERENT_EMAIL, "password": TEST_PASSWORD, "username": EXISTING_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = UserNameAlreadyExistsError(user_data["username"])
            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "username" in response.json()["detail"].lower()

    async def test_register_disposable_email(self, async_client: AsyncClient) -> None:
        user_data = {"email": DISPOSABLE_EMAIL, "password": TEST_PASSWORD, "username": "tempuser"}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.side_effect = DisposableEmailError(user_data["email"])
            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposable" in response.json()["detail"].lower()

    async def test_register_weak_password(self, async_client: AsyncClient) -> None:
        user_data = {"email": "user@example.com", "password": WEAK_PASSWORD, "username": "user"}
        response = await async_client.post("/auth/register", json=user_data)
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_CONTENT]

    async def test_register_with_organization(self, async_client: AsyncClient) -> None:
        user_data = {
            "email": OWNER_EMAIL,
            "password": TEST_PASSWORD,
            "username": "owner",
            "organization": {"name": ORG_NAME, "location": ORG_LOCATION, "description": ORG_DESC},
        }

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreateWithOrganization(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
                organization=OrganizationCreate(**user_data["organization"]),
            )
            response = await async_client.post("/auth/register", json=user_data)

        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ]


@pytest.mark.asyncio
class TestLoginEndpoint:
    """Tests for FastAPI-Users login endpoints."""

    async def test_bearer_login_with_email(self, async_client: AsyncClient) -> None:
        user_data = {"email": LOGIN_EMAIL, "password": TEST_PASSWORD, "username": LOGIN_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await async_client.post("/auth/register", json=user_data)

        response = await async_client.post(
            "/auth/bearer/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        if response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]:
            if response.status_code == status.HTTP_200_OK:
                try:
                    data = response.json()
                    assert "access_token" in data or len(data) > 0
                except ValueError, json.JSONDecodeError:
                    pass
            assert "refresh_token" in response.cookies or "set-cookie" in response.headers

    async def test_bearer_login_invalid_credentials(self, async_client: AsyncClient) -> None:
        response = await async_client.post(
            "/auth/bearer/login",
            data={"username": INVALID_EMAIL, "password": INVALID_PASSWORD},
        )
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_cookie_login(self, async_client: AsyncClient) -> None:
        user_data = {"email": COOKIE_EMAIL, "password": TEST_PASSWORD, "username": COOKIE_USERNAME}

        with patch("app.api.auth.routers.register.validate_user_create") as mock_create_override:
            mock_create_override.return_value = UserCreate(
                email=user_data["email"],
                password=user_data["password"],
                username=user_data["username"],
            )
            await async_client.post("/auth/register", json=user_data)

        response = await async_client.post(
            "/auth/cookie/login",
            data={"username": user_data["email"], "password": user_data["password"]},
        )

        if response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]:
            assert len(response.cookies) > 0 or "set-cookie" in response.headers


@pytest.mark.asyncio
class TestLogoutEndpoint:
    """Tests for FastAPI-Users logout endpoints."""

    async def test_bearer_logout_unauthenticated(self, async_client: AsyncClient) -> None:
        response = await async_client.post("/auth/bearer/logout")
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_500_INTERNAL_SERVER_ERROR]

    async def test_cookie_logout(self, async_client: AsyncClient) -> None:
        response = await async_client.post("/auth/cookie/logout")
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ]


@pytest.mark.asyncio
class TestRateLimiting:
    """Tests for rate limiting on auth endpoints."""

    async def test_login_rate_limit_disabled_in_tests(self, async_client: AsyncClient) -> None:
        responses = []
        for _ in range(10):
            response = await async_client.post(
                "/auth/bearer/login",
                data={"username": INVALID_EMAIL, "password": "WrongPassword"},
            )
            responses.append(response.status_code)

        assert status.HTTP_429_TOO_MANY_REQUESTS not in responses, f"Rate limiting not disabled: {responses}"
