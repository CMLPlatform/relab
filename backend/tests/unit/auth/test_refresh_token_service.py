"""Unit tests for refresh token service."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import pytest
from fastapi import HTTPException

from app.api.auth.config import settings
from app.api.auth.services.refresh_token_service import (
    blacklist_token,
    create_refresh_token,
    rotate_refresh_token,
    verify_refresh_token,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

# Constants for test values to avoid magic value warnings
# Renamed to avoid S105 while keeping meaningful names
TOKEN_VAL_INVALID = "invalid"  # noqa: S105
TOKEN_VAL_REVOKED = "revoked"  # noqa: S105
TOKEN_LENGTH = 64
TTL_MARGIN = 10
TTL_ABS_MARGIN = 5


@pytest.mark.asyncio
class TestRefreshTokenService:
    """Tests for refresh token service functions."""

    async def test_create_refresh_token(self, redis_client: Redis) -> None:
        """Test creating a refresh token."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        # Token should be 64 characters (urlsafe base64, 48 bytes)
        assert len(token) == TOKEN_LENGTH
        assert isinstance(token, str)

        # Verify token is stored in Redis
        stored_data = await redis_client.get(f"auth:rt:{token}")
        assert stored_data is not None
        assert (
            str(user_id) in stored_data.decode("utf-8")
            if isinstance(stored_data, bytes)
            else str(user_id) in stored_data
        )

        # Verify TTL is set correctly (approximately 30 days)
        ttl = await redis_client.ttl(f"auth:rt:{token}")
        expected_ttl = settings.refresh_token_expire_days * 24 * 60 * 60
        assert ttl > expected_ttl - TTL_MARGIN  # Allow small time difference

    async def test_verify_refresh_token_success(self, redis_client: Redis) -> None:
        """Test verifying a valid refresh token."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        result = await verify_refresh_token(redis_client, token)

        assert result == user_id

    async def test_verify_refresh_token_not_found(self, redis_client: Redis) -> None:
        """Test verifying a non-existent token raises 401."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_refresh_token(redis_client, "nonexistent-token-123456789012345678901234567890")

        assert exc_info.value.status_code == 401
        assert TOKEN_VAL_INVALID in exc_info.value.detail.lower()

    async def test_verify_refresh_token_blacklisted(self, redis_client: Redis) -> None:
        """Test verifying a blacklisted token raises 401."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)
        await blacklist_token(redis_client, token)

        with pytest.raises(HTTPException) as exc_info:
            await verify_refresh_token(redis_client, token)

        assert exc_info.value.status_code == 401
        assert TOKEN_VAL_REVOKED in exc_info.value.detail.lower()

    async def test_blacklist_token(self, redis_client: Redis) -> None:
        """Test blacklisting a refresh token."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        # Verify token exists and is valid
        result = await verify_refresh_token(redis_client, token)
        assert result == user_id

        # Blacklist the token
        await blacklist_token(redis_client, token)

        # Token should be blacklisted
        is_blacklisted = await redis_client.exists(f"auth:rt_blacklist:{token}")
        assert is_blacklisted

        # Original token data should be deleted
        stored_data = await redis_client.get(f"auth:rt:{token}")
        assert stored_data is None

        # Verify token is now invalid
        with pytest.raises(HTTPException):
            await verify_refresh_token(redis_client, token)

    async def test_rotate_refresh_token(self, redis_client: Redis) -> None:
        """Test rotating a refresh token (create new, blacklist old)."""
        user_id = uuid.uuid4()
        old_token = await create_refresh_token(redis_client, user_id)

        # Rotate the token
        new_token = await rotate_refresh_token(redis_client, old_token)

        # New token should be different
        assert new_token != old_token
        assert len(new_token) == TOKEN_LENGTH

        # New token should be valid
        result = await verify_refresh_token(redis_client, new_token)
        assert result == user_id

        # Old token should be blacklisted
        is_blacklisted = await redis_client.exists(f"auth:rt_blacklist:{old_token}")
        assert is_blacklisted

        # Old token should be invalid
        with pytest.raises(HTTPException):
            await verify_refresh_token(redis_client, old_token)

    async def test_multiple_tokens_per_user(self, redis_client: Redis) -> None:
        """Test that a user can have multiple active refresh tokens (multi-device)."""
        user_id = uuid.uuid4()
        token_1 = await create_refresh_token(redis_client, user_id)
        token_2 = await create_refresh_token(redis_client, user_id)

        # Both tokens should be valid
        await verify_refresh_token(redis_client, token_1)
        await verify_refresh_token(redis_client, token_2)

    async def test_token_expiry_ttl(self, redis_client: Redis) -> None:
        """Test that tokens have correct TTL set."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        # Check TTL on token data
        token_ttl = await redis_client.ttl(f"auth:rt:{token}")
        expected_ttl = settings.refresh_token_expire_days * 24 * 60 * 60

        # TTL should be close to expected (within 5 seconds)
        assert abs(token_ttl - expected_ttl) < TTL_ABS_MARGIN
