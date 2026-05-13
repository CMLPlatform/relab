"""Shared constants and helpers for auth integration tests."""

from typing import TYPE_CHECKING, Any

from fastapi import status

from app.api.auth.services.password_hashing import build_password_helper

if TYPE_CHECKING:
    from httpx import AsyncClient

TEST_EMAIL = "newuser@example.com"
TEST_PASSWORD = "correct-horse-battery-staple-v42"
TEST_USERNAME = "newuser"
DUPLICATE_EMAIL = "existing@example.com"
UNIQUE_USERNAME = "uniqueuser"
DIFFERENT_EMAIL = "different@example.com"
EXISTING_USERNAME = "existing_user"
DISPOSABLE_EMAIL = "temp@tempmail.com"
WEAK_PASSWORD = "short"
LOGIN_EMAIL = "logintest@example.com"
LOGIN_USERNAME = "logintest"
COOKIE_EMAIL = "cookie_test@example.com"
COOKIE_USERNAME = "cookie_test"
INVALID_EMAIL = "nonexistent@example.com"
INVALID_PASSWORD = "WrongPassword123"
INVALID_REFRESH_TOKEN = "invalid-token-1234567890123456789012345678"
USER1_EMAIL = "update_user1@example.com"
USER1_USERNAME = "user_one_unique"
USER2_EMAIL = "update_user2@example.com"
USER2_USERNAME = "user_two_unique"
NEW_USERNAME = "totally_fresh_username"
TAKEN_USERNAME = "already_taken_user"
FRONTEND_REDIRECT_URI = "http://localhost:3000"
JWT_DOT_COUNT = 2
TEST_STATE_JWT_SECRET = "test-state-jwt-secret-32-bytes-long"


def hash_test_password(password: str) -> str:
    """Hash a password with a real supported scheme for auth-focused tests."""
    return build_password_helper().hash(password)


async def login_bearer(api_client: AsyncClient, *, email: str, password: str) -> dict[str, Any]:
    """Log in without MFA and return bearer token JSON."""
    response = await api_client.post(
        "/v1/auth/bearer/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    return dict(response.json())


async def login_session(api_client: AsyncClient, *, email: str, password: str) -> None:
    """Log in without MFA and keep session cookies on the client."""
    response = await api_client.post(
        "/v1/auth/session/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
