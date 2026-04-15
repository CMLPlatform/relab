"""Shared constants for auth integration and unit-style endpoint tests."""

from functools import lru_cache

from pwdlib import PasswordHash

TEST_EMAIL = "newuser@example.com"
TEST_PASSWORD = "SecurePassword123"
TEST_USERNAME = "newuser"
DUPLICATE_EMAIL = "existing@example.com"
UNIQUE_USERNAME = "uniqueuser"
DIFFERENT_EMAIL = "different@example.com"
EXISTING_USERNAME = "existing_user"
DISPOSABLE_EMAIL = "temp@tempmail.com"
WEAK_PASSWORD = "short"
OWNER_EMAIL = "owner@example.com"
ORG_NAME = "Test Organization"
ORG_LOCATION = "Test City"
ORG_DESC = "Test Description"
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


@lru_cache(maxsize=1)
def _password_hasher() -> PasswordHash:
    """Return a stable password hasher for auth integration test data."""
    return PasswordHash.recommended()


def hash_test_password(password: str) -> str:
    """Hash a password with a real supported scheme for auth-focused tests."""
    return _password_hasher().hash(password)
