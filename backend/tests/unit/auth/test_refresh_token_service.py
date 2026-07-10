"""Unit tests for refresh token service."""

import json
import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest

from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.api.auth.services.refresh_token_service import (
    _REUSE_GRACE_SECONDS,
    _blacklist_key,
    _refresh_token_key,
    _user_tokens_key,
    blacklist_token,
    create_refresh_token,
    revoke_all_user_tokens,
    rotate_refresh_token,
    verify_refresh_token,
)
from app.api.auth.services.token_store import token_key
from app.api.common.audit import AuditAction
from app.core.constants import HOUR

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


async def test_blacklist_token_expired_ttl_defaults_to_hour(redis_client: Redis) -> None:
    """A token with no positive remaining TTL gets a bounded HOUR blacklist entry, not one that evaporates instantly."""
    user_id = uuid.uuid4()
    token = await create_refresh_token(redis_client, user_id)
    # Drop the metadata so its remaining TTL reads as expired (-2), exercising the ttl <= 0 fallback.
    await redis_client.delete(_refresh_token_key(token))

    await blacklist_token(redis_client, token)

    blacklist_ttl = await redis_client.ttl(_blacklist_key(token))
    assert HOUR - 5 <= blacklist_ttl <= HOUR


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


async def test_rotate_refresh_token_reuse_revokes_session_family(
    redis_client: Redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Replaying an already-rotated token well after rotation revokes every live token."""
    now = 1_700_000_000
    monkeypatch.setattr("app.api.auth.services.refresh_token_service.time.time", lambda: now)

    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)
    sibling_token = await create_refresh_token(redis_client, user_id)

    new_token = await rotate_refresh_token(redis_client, old_token)

    # Well past the benign-retry grace window: this is genuine stale-token reuse.
    now += _REUSE_GRACE_SECONDS + 60

    with (
        patch("app.api.auth.services.refresh_token_service.audit_event") as audit,
        pytest.raises(RefreshTokenRevokedError),
    ):
        await rotate_refresh_token(redis_client, old_token)

    assert audit.call_args.args[1] is AuditAction.SESSIONS_REVOKED
    assert audit.call_args.kwargs["context"].reason == "refresh_token_reuse_detected"

    for revoked in (new_token, sibling_token):
        with pytest.raises((RefreshTokenInvalidError, RefreshTokenRevokedError)):
            await verify_refresh_token(redis_client, revoked)


async def test_verify_refresh_token_reuse_revokes_session_family(
    redis_client: Redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reuse detection must fire on the real refresh path, which verifies before rotating.

    Regression: ``session_flow.refresh_tokens_for_active_user`` calls ``verify_refresh_token``
    first, and verify rejected a blacklisted token outright — so the stolen-token family
    revocation in ``rotate_refresh_token`` was unreachable in production.
    """
    now = 1_700_000_000
    monkeypatch.setattr("app.api.auth.services.refresh_token_service.time.time", lambda: now)

    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)
    sibling_token = await create_refresh_token(redis_client, user_id)
    new_token = await rotate_refresh_token(redis_client, old_token)

    # Well past the benign-retry grace window: this is genuine stale-token reuse.
    now += _REUSE_GRACE_SECONDS + 60

    with (
        patch("app.api.auth.services.refresh_token_service.audit_event") as audit,
        pytest.raises(RefreshTokenRevokedError),
    ):
        await verify_refresh_token(redis_client, old_token)

    assert audit.call_args.args[1] is AuditAction.SESSIONS_REVOKED
    assert audit.call_args.kwargs["context"].reason == "refresh_token_reuse_detected"

    for revoked in (new_token, sibling_token):
        with pytest.raises((RefreshTokenInvalidError, RefreshTokenRevokedError)):
            await verify_refresh_token(redis_client, revoked)


async def test_verify_refresh_token_benign_retry_does_not_revoke_family(redis_client: Redis) -> None:
    """A replay inside the grace window must not revoke siblings when verify sees it first."""
    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)
    sibling_token = await create_refresh_token(redis_client, user_id)
    new_token = await rotate_refresh_token(redis_client, old_token)

    with (
        patch("app.api.auth.services.refresh_token_service.audit_event") as audit,
        pytest.raises(RefreshTokenRevokedError),
    ):
        await verify_refresh_token(redis_client, old_token)

    assert audit.call_args.args[1] is AuditAction.AUTHORIZATION_DENIED
    assert audit.call_args.kwargs["context"].reason == "refresh_token_replay_within_grace"

    # The winning rotation's new token and the unrelated sibling must both survive.
    assert await verify_refresh_token(redis_client, new_token) == user_id
    assert await verify_refresh_token(redis_client, sibling_token) == user_id


async def test_rotate_refresh_token_benign_retry_does_not_revoke_family(redis_client: Redis) -> None:
    """A near-immediate replay of a just-rotated token must not nuke sibling sessions."""
    user_id = uuid.uuid4()
    old_token = await create_refresh_token(redis_client, user_id)
    sibling_token = await create_refresh_token(redis_client, user_id)

    new_token = await rotate_refresh_token(redis_client, old_token)

    # Client retry of the very same request, arriving immediately after rotation.
    with (
        patch("app.api.auth.services.refresh_token_service.audit_event") as audit,
        pytest.raises(RefreshTokenRevokedError),
    ):
        await rotate_refresh_token(redis_client, old_token)

    # Tolerated, but never silent: a thief replaying inside the window looks identical to
    # this retry, so the event has to be observable even though the family survives.
    assert audit.call_args.args[1] is AuditAction.AUTHORIZATION_DENIED
    assert audit.call_args.kwargs["context"].reason == "refresh_token_replay_within_grace"

    # The winning rotation's new token and the unrelated sibling must both survive.
    assert await verify_refresh_token(redis_client, new_token) == user_id
    assert await verify_refresh_token(redis_client, sibling_token) == user_id


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


async def test_create_refresh_token_does_not_shrink_shared_set_ttl(
    redis_client: Redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A later, shorter-lived token must not cut short the shared set's TTL below siblings'."""
    now = 1_700_000_000
    monkeypatch.setattr("app.api.auth.services.refresh_token_service.time.time", lambda: now)

    user_id = uuid.uuid4()
    await create_refresh_token(redis_client, user_id, absolute_expires_at=now + 10_000)
    long_ttl = await redis_client.ttl(_user_tokens_key(user_id))
    assert long_ttl > 9_000

    # Simulates a rotation close to the absolute session expiry, producing a much
    # shorter-lived token for the same shared set.
    await create_refresh_token(redis_client, user_id, absolute_expires_at=now + 5)
    shrunk_ttl = await redis_client.ttl(_user_tokens_key(user_id))

    # Without gt=True this would collapse to ~5s and the set could expire while the
    # long-lived sibling token is still live, breaking revoke_all_user_tokens for it.
    assert shrunk_ttl >= long_ttl - 2


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
