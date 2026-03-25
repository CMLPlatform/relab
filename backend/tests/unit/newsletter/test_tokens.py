"""Unit tests for newsletter tokens."""
# spell-checker: ignore usefixtures

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest

from app.api.newsletter.utils.tokens import JWTType, create_jwt_token, verify_jwt_token

if TYPE_CHECKING:
    from collections.abc import Generator

# Constants for magic values
TEST_EMAIL = "test@example.com"
TEST_SECRET = "test_secret"
INVALID_TOKEN = "invalid.token.string"
TTL_3600 = 3600
TTL_7200 = 7200


@pytest.fixture
def mock_settings() -> Generator[MagicMock]:
    """Mock settings for newsletter token tests."""
    with patch("app.api.newsletter.utils.tokens.settings") as mocked_settings:
        mocked_settings.newsletter_secret = MagicMock()
        mocked_settings.newsletter_secret.get_secret_value.return_value = TEST_SECRET
        mocked_settings.verification_token_ttl_seconds = TTL_3600
        mocked_settings.newsletter_unsubscription_token_ttl_seconds = TTL_7200
        yield mocked_settings


@pytest.mark.usefixtures("mock_settings")
def test_create_and_verify_confirmation_token() -> None:
    """Test creating and verifying a confirmation token."""
    test_token = create_jwt_token(TEST_EMAIL, JWTType.NEWSLETTER_CONFIRMATION)
    assert test_token is not None

    verified_email = verify_jwt_token(test_token, JWTType.NEWSLETTER_CONFIRMATION)
    assert verified_email == TEST_EMAIL


@pytest.mark.usefixtures("mock_settings")
def test_create_and_verify_unsubscribe_token() -> None:
    """Test creating and verifying an unsubscribe token."""
    test_token = create_jwt_token(TEST_EMAIL, JWTType.NEWSLETTER_UNSUBSCRIBE)
    assert test_token is not None

    verified_email = verify_jwt_token(test_token, JWTType.NEWSLETTER_UNSUBSCRIBE)
    assert verified_email == TEST_EMAIL


@pytest.mark.usefixtures("mock_settings")
def test_verify_invalid_token() -> None:
    """Test verification of an invalid token."""
    verified_email = verify_jwt_token(INVALID_TOKEN, JWTType.NEWSLETTER_CONFIRMATION)
    assert verified_email is None


@pytest.mark.usefixtures("mock_settings")
def test_verify_wrong_token_type() -> None:
    """Test verification of a token with the wrong type."""
    test_token = create_jwt_token(TEST_EMAIL, JWTType.NEWSLETTER_CONFIRMATION)

    # Try to verify as unsubscribe token
    verified_email = verify_jwt_token(test_token, JWTType.NEWSLETTER_UNSUBSCRIBE)
    assert verified_email is None


@pytest.mark.usefixtures("mock_settings")
def test_token_expiration() -> None:
    """Test token expiration logic."""
    # Mock datetime to control time
    fixed_now = datetime(2023, 1, 1, 12, 0, 0, tzinfo=UTC)

    with patch("app.api.newsletter.utils.tokens.datetime") as mock_datetime:
        mock_datetime.now.return_value = fixed_now

        test_token = create_jwt_token(TEST_EMAIL, JWTType.NEWSLETTER_CONFIRMATION)
        assert test_token is not None

        # Verify immediately (should work)
        # We move time slightly forward but within TTL (3600s)
        mock_datetime.now.return_value = fixed_now + timedelta(seconds=1)

    # Create a token that is already expired
    with patch("app.api.newsletter.utils.tokens.datetime") as mock_datetime_create:
        # Set "now" to 2 hours ago
        past_time = datetime.now(UTC) - timedelta(hours=2)
        mock_datetime_create.now.return_value = past_time

        # This will create a token with exp = past_time + 3600s (still 1 hour ago)
        expired_token = create_jwt_token(TEST_EMAIL, JWTType.NEWSLETTER_CONFIRMATION)

    # Verify now (should fail)
    assert verify_jwt_token(expired_token, JWTType.NEWSLETTER_CONFIRMATION) is None
