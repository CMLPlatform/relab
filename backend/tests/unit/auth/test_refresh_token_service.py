"""Unit tests for refresh token service."""
# spell-checker: ignore setex

# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING

import pytest

from app.api.auth.config import settings
from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.api.auth.services import refresh_token_service
from app.api.auth.services.refresh_token_service import (
    blacklist_token,
    create_refresh_token,
    refresh_token_fingerprint,
    rotate_refresh_token,
    verify_refresh_token,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

# Constants for test values to avoid magic value warnings
# Renamed to avoid S105 while keeping meaningful names
TOKEN_VAL_INVALID = "invalid"
TOKEN_VAL_REVOKED = "revoked"
TTL_ABS_MARGIN = 5


def _json_loads_redis(value: bytes | str) -> dict:
    """Decode a Redis JSON value from either real Redis or fakeredis."""
    return json.loads(value.decode("utf-8") if isinstance(value, bytes) else value)


class TestRefreshTokenService:
    """Tests for refresh token service functions."""

    async def test_create_refresh_token(self, redis_client: Redis) -> None:
        """Token is stored under a fingerprint key with the minimum session metadata."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        assert isinstance(token, str)

        fingerprint = refresh_token_fingerprint(token)
        assert fingerprint != token
        assert await redis_client.get(f"auth:rt:{token}") is None

        stored_data = await redis_client.get(f"auth:rt:{fingerprint}")
        assert stored_data is not None
        payload = _json_loads_redis(stored_data)
        assert payload["user_id"] == str(user_id)
        assert set(payload) == {"user_id", "absolute_expires_at"}
        assert payload["absolute_expires_at"] > 0

    async def test_verify_refresh_token_rejects_malformed_token_before_lookup(self, redis_client: Redis) -> None:
        """Refresh tokens are untrusted input and must match the generated token shape."""
        user_id = uuid.uuid4()
        malformed_token = "bad token with spaces"
        await redis_client.setex(
            f"auth:rt:{refresh_token_fingerprint(malformed_token)}",
            3600,
            json.dumps(
                {
                    "user_id": str(user_id),
                    "absolute_expires_at": 4_102_444_800,
                }
            ),
        )

        with pytest.raises(RefreshTokenInvalidError):
            await verify_refresh_token(redis_client, malformed_token)

    async def test_verify_refresh_token_success(self, redis_client: Redis) -> None:
        """Test verifying a valid refresh token."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        result = await verify_refresh_token(redis_client, token)

        assert result == user_id

    async def test_verify_refresh_token_not_found(self, redis_client: Redis) -> None:
        """Test verifying a non-existent token raises 401."""
        with pytest.raises(RefreshTokenInvalidError) as exc_info:
            await verify_refresh_token(redis_client, "nonexistent-token-123456789012345678901234567890")

        assert exc_info.value.http_status_code == 401
        assert TOKEN_VAL_INVALID in exc_info.value.message.lower()

    async def test_rotate_refresh_token_rejects_blacklisted_token(self, redis_client: Redis) -> None:
        """Rotation must not accept a token after it appears in the blacklist."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)
        fingerprint = refresh_token_fingerprint(token)
        await redis_client.setex(f"auth:rt_blacklist:{fingerprint}", 3600, "1")

        with pytest.raises(RefreshTokenRevokedError):
            await rotate_refresh_token(redis_client, token)

    async def test_blacklist_token_revokes_and_removes_token(self, redis_client: Redis) -> None:
        """Blacklisting removes the active token and makes verification fail as revoked."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)

        result = await verify_refresh_token(redis_client, token)
        assert result == user_id

        await blacklist_token(redis_client, token)

        fingerprint = refresh_token_fingerprint(token)
        is_blacklisted = await redis_client.exists(f"auth:rt_blacklist:{fingerprint}")
        assert is_blacklisted

        stored_data = await redis_client.get(f"auth:rt:{fingerprint}")
        assert stored_data is None

        with pytest.raises(RefreshTokenRevokedError):
            await verify_refresh_token(redis_client, token)

    async def test_rotate_refresh_token(self, redis_client: Redis) -> None:
        """Test rotating a refresh token (create new, blacklist old)."""
        user_id = uuid.uuid4()
        old_token = await create_refresh_token(redis_client, user_id)

        new_token = await rotate_refresh_token(redis_client, old_token)

        assert new_token != old_token

        result = await verify_refresh_token(redis_client, new_token)
        assert result == user_id

        is_blacklisted = await redis_client.exists(f"auth:rt_blacklist:{refresh_token_fingerprint(old_token)}")
        assert is_blacklisted

        with pytest.raises((RefreshTokenInvalidError, RefreshTokenRevokedError)):
            await verify_refresh_token(redis_client, old_token)

    async def test_rotate_refresh_token_preserves_absolute_session_expiry(self, redis_client: Redis) -> None:
        """Rotation should not extend the absolute refresh session lifetime."""
        user_id = uuid.uuid4()
        old_token = await create_refresh_token(redis_client, user_id)
        old_payload_raw = await redis_client.get(f"auth:rt:{refresh_token_fingerprint(old_token)}")
        assert old_payload_raw is not None
        old_payload = _json_loads_redis(old_payload_raw)

        new_token = await rotate_refresh_token(redis_client, old_token)

        new_payload_raw = await redis_client.get(f"auth:rt:{refresh_token_fingerprint(new_token)}")
        assert new_payload_raw is not None
        new_payload = _json_loads_redis(new_payload_raw)
        assert new_payload["absolute_expires_at"] == old_payload["absolute_expires_at"]

    async def test_verify_refresh_token_rejects_absolute_expired_session(self, redis_client: Redis) -> None:
        """A refresh token should fail once its absolute session lifetime is over."""
        user_id = uuid.uuid4()
        token = await create_refresh_token(redis_client, user_id)
        token_key = f"auth:rt:{refresh_token_fingerprint(token)}"
        payload_raw = await redis_client.get(token_key)
        assert payload_raw is not None
        payload = _json_loads_redis(payload_raw)
        payload["absolute_expires_at"] = 1
        await redis_client.setex(token_key, 3600, json.dumps(payload))

        with pytest.raises(RefreshTokenInvalidError):
            await verify_refresh_token(redis_client, token)

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
        token_ttl = await redis_client.ttl(f"auth:rt:{refresh_token_fingerprint(token)}")
        expected_ttl = settings.refresh_token_expire_days * 24 * 60 * 60

        # TTL should be close to expected (within 5 seconds)
        assert abs(token_ttl - expected_ttl) < TTL_ABS_MARGIN


# Private method access is needed for testing in-memory fallback behavior
class TestRefreshTokenServiceInMemory:
    """Tests for refresh token service in-memory fallback (redis=None)."""

    async def test_create_and_verify_refresh_token_in_memory(self) -> None:
        """The in-memory fallback can create and verify a token."""
        refresh_token_service._memory_tokens.clear()
        refresh_token_service._memory_blacklist.clear()
        user_id = uuid.uuid4()

        token = await create_refresh_token(None, user_id)
        result = await verify_refresh_token(None, token)

        assert isinstance(token, str)
        assert result == user_id
        assert token in refresh_token_service._memory_tokens
        metadata = refresh_token_service._memory_tokens[token]
        assert metadata["user_id"] == str(user_id)
        assert set(metadata) == {"user_id", "absolute_expires_at"}

        refresh_token_service._memory_tokens.clear()
        refresh_token_service._memory_blacklist.clear()

    async def test_blacklist_token_in_memory(self) -> None:
        """Blacklisting removes an in-memory token and makes verification fail."""
        refresh_token_service._memory_tokens.clear()
        refresh_token_service._memory_blacklist.clear()
        user_id = uuid.uuid4()

        token = await create_refresh_token(None, user_id)
        assert token in refresh_token_service._memory_tokens

        await blacklist_token(None, token)

        assert token not in refresh_token_service._memory_tokens
        assert token in refresh_token_service._memory_blacklist
        with pytest.raises(RefreshTokenRevokedError) as exc_info:
            await verify_refresh_token(None, token)

        assert exc_info.value.http_status_code == 401
        assert TOKEN_VAL_REVOKED in exc_info.value.message.lower()

        refresh_token_service._memory_tokens.clear()
        refresh_token_service._memory_blacklist.clear()
