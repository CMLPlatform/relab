"""Unit tests for refresh token service."""

# Private member behaviour is tested here, so we want to allow it.

import json
import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.api.auth.services.refresh_token_service import (
    blacklist_token,
    create_refresh_token,
    revoke_all_user_tokens,
    rotate_refresh_token,
    verify_refresh_token,
)
from app.api.auth.services.token_store import token_key

if TYPE_CHECKING:
    from redis.asyncio import Redis

TOKEN_VAL_INVALID = "invalid"


def _json_loads_redis(value: bytes | str) -> dict:
    """Decode a Redis JSON value from either real Redis or fakeredis."""
    return json.loads(value.decode("utf-8") if isinstance(value, bytes) else value)


async def test_create_refresh_token(redis_client: Redis) -> None:
    """Created refresh tokens should verify for the owning user."""
    user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)

    assert isinstance(token, str)
    assert await verify_refresh_token(redis_client, token) == user_id


async def test_verify_refresh_token_rejects_malformed_token_before_lookup(redis_client: Redis) -> None:
    """Refresh tokens are untrusted input and must match the generated token shape."""
    del redis_client
    redis = AsyncMock()
    malformed_token = "bad token with spaces"

    with pytest.raises(RefreshTokenInvalidError):
        await verify_refresh_token(redis, malformed_token)

    redis.exists.assert_not_awaited()
    redis.get.assert_not_awaited()


async def test_verify_refresh_token_not_found(redis_client: Redis) -> None:
    """Test verifying a non-existent token raises 401."""
    with pytest.raises(RefreshTokenInvalidError) as exc_info:
        await verify_refresh_token(redis_client, "nonexistent-token-123456789012345678901234567890")

    assert exc_info.value.http_status_code == 401
    assert TOKEN_VAL_INVALID in exc_info.value.message.lower()


async def test_blacklist_token_revokes_and_removes_token(redis_client: Redis) -> None:
    """Blacklisting removes the active token and makes verification fail as revoked."""
    user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)

    result = await verify_refresh_token(redis_client, token)
    assert result == user_id

    await blacklist_token(redis_client, token)

    with pytest.raises(RefreshTokenRevokedError):
        await verify_refresh_token(redis_client, token)


async def test_rotate_refresh_token(redis_client: Redis) -> None:
    """Test rotating a refresh token (create new, blacklist old)."""
    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)

    new_token = await rotate_refresh_token(redis_client, old_token)

    assert new_token != old_token

    result = await verify_refresh_token(redis_client, new_token)
    assert result == user_id

    with pytest.raises((RefreshTokenInvalidError, RefreshTokenRevokedError)):
        await verify_refresh_token(redis_client, old_token)


async def test_rotate_refresh_token_rejects_blacklisted_token(redis_client: Redis) -> None:
    """Rotation must not accept a token after it appears in the blacklist."""
    user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)
    await redis_client.setex(token_key("auth:rt_blacklist", token), 3600, "1")

    with pytest.raises(RefreshTokenRevokedError):
        await rotate_refresh_token(redis_client, token)


async def test_rotate_refresh_token_reuse_revokes_session_family(redis_client: Redis) -> None:
    """Replaying an already-rotated token revokes every live token for that user."""
    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)
    sibling_token = await create_refresh_token(redis_client, user_id)

    new_token = await rotate_refresh_token(redis_client, old_token)

    # Replaying the consumed old token is a theft signal -> kill the family.
    with pytest.raises(RefreshTokenRevokedError):
        await rotate_refresh_token(redis_client, old_token)

    for revoked in (new_token, sibling_token):
        with pytest.raises((RefreshTokenInvalidError, RefreshTokenRevokedError)):
            await verify_refresh_token(redis_client, revoked)


async def test_rotate_refresh_token_preserves_absolute_session_expiry(
    redis_client: Redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Rotation should not extend the absolute refresh session lifetime."""
    user_id = uuid.uuid4()
    now = 1_700_000_000
    monkeypatch.setattr("app.api.auth.services.refresh_token_service.time.time", lambda: now)

    old_token = await create_refresh_token(redis_client, user_id)
    new_token = await rotate_refresh_token(redis_client, old_token)

    now += 10 * 365 * 24 * 60 * 60

    with pytest.raises(RefreshTokenInvalidError):
        await verify_refresh_token(redis_client, new_token)


async def test_verify_refresh_token_rejects_absolute_expired_session(redis_client: Redis) -> None:
    """A refresh token should fail once its absolute session lifetime is over."""
    user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)
    redis_key = token_key("auth:rt", token)
    payload_raw = await redis_client.get(redis_key)
    assert payload_raw is not None
    payload = _json_loads_redis(payload_raw)
    payload["absolute_expires_at"] = 1
    await redis_client.setex(redis_key, 3600, json.dumps(payload))

    with pytest.raises(RefreshTokenInvalidError):
        await verify_refresh_token(redis_client, token)


async def test_multiple_tokens_per_user(redis_client: Redis) -> None:
    """Test that a user can have multiple active refresh tokens (multi-device)."""
    user_id = uuid.uuid4()
    token_1 = await create_refresh_token(redis_client, user_id)
    token_2 = await create_refresh_token(redis_client, user_id)

    # Both tokens should be valid
    await verify_refresh_token(redis_client, token_1)
    await verify_refresh_token(redis_client, token_2)


async def test_revoke_all_user_tokens_revokes_only_that_user(redis_client: Redis) -> None:
    """User-wide revocation should blacklist every active token for one user."""
    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)
    other_token = await create_refresh_token(redis_client, other_user_id)

    await revoke_all_user_tokens(redis_client, user_id)

    with pytest.raises(RefreshTokenRevokedError):
        await verify_refresh_token(redis_client, token)
    assert await verify_refresh_token(redis_client, other_token) == other_user_id
