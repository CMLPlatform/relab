"""Refresh token service for managing long-lived authentication tokens.

This module supports both Redis-backed storage and an in-memory fallback
used when Redis is unavailable (convenient for local development).
"""
# spell-checker: ignore setex

from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import UUID4

from app.api.auth.config import settings
from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.core.constants import HOUR
from app.core.redis import redis_int, redis_str_set

if TYPE_CHECKING:
    from redis.asyncio import Redis


# In-memory stores used when Redis is not available. Keys are the raw token strings.
# Values for _memory_tokens: token -> refresh-token metadata
# Values for _memory_blacklist: token -> expire_ts
_memory_tokens: dict[str, dict[str, str | int]] = {}
_memory_blacklist: dict[str, float] = {}

_USER_TOKENS_KEY_PREFIX = "auth:rt:user:"
_REFRESH_TOKEN_BYTES = 48
_REFRESH_TOKEN_MIN_LENGTH = 32
_REFRESH_TOKEN_PATTERN = re.compile(rf"^[A-Za-z0-9_-]{{{_REFRESH_TOKEN_MIN_LENGTH},}}$")


def refresh_token_fingerprint(token: str) -> str:
    """Return a stable non-secret fingerprint for refresh-token storage keys."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _refresh_token_key(token_fingerprint: str) -> str:
    return f"auth:rt:{token_fingerprint}"


def _refresh_token_blacklist_key(token_fingerprint: str) -> str:
    return f"auth:rt_blacklist:{token_fingerprint}"


def _refresh_token_ttl_seconds() -> int:
    return settings.refresh_token_expire_days * 86_400


def _absolute_session_ttl_seconds() -> int:
    return settings.refresh_session_absolute_expire_days * 86_400


def _validate_refresh_token_shape(token: str) -> None:
    if not _REFRESH_TOKEN_PATTERN.fullmatch(token):
        raise RefreshTokenInvalidError


def _new_refresh_token() -> str:
    return secrets.token_urlsafe(_REFRESH_TOKEN_BYTES)


def _build_token_metadata(
    user_id: UUID,
    *,
    absolute_expires_at: int | None = None,
) -> dict[str, str | int]:
    now = int(time.time())
    return {
        "user_id": str(user_id),
        "absolute_expires_at": absolute_expires_at or now + _absolute_session_ttl_seconds(),
    }


def _metadata_ttl_seconds(metadata: dict[str, str | int]) -> int:
    absolute_expires_at = int(metadata["absolute_expires_at"])
    remaining_absolute_ttl = absolute_expires_at - int(time.time())
    return min(_refresh_token_ttl_seconds(), remaining_absolute_ttl)


def _decode_token_metadata(raw_value: bytes | str | None) -> dict[str, str | int]:
    if raw_value is None:
        raise RefreshTokenInvalidError
    try:
        payload = json.loads(raw_value.decode("utf-8") if isinstance(raw_value, bytes) else raw_value)
    except json.JSONDecodeError as err:
        raise RefreshTokenInvalidError from err

    if not isinstance(payload, dict):
        raise RefreshTokenInvalidError

    try:
        user_id = str(payload["user_id"])
        absolute_expires_at = int(payload["absolute_expires_at"])
    except (KeyError, TypeError, ValueError) as err:
        raise RefreshTokenInvalidError from err
    return {
        "user_id": user_id,
        "absolute_expires_at": absolute_expires_at,
    }


async def _load_active_token_metadata(redis: Redis | None, token: str) -> dict[str, str | int]:
    _validate_refresh_token_shape(token)
    now = time.time()

    if redis is None:
        bl_expire = _memory_blacklist.get(token)
        if bl_expire and bl_expire > now:
            raise RefreshTokenRevokedError
        metadata = _memory_tokens.get(token)
        if not metadata:
            raise RefreshTokenInvalidError
    else:
        token_fingerprint = refresh_token_fingerprint(token)
        if await redis.exists(_refresh_token_blacklist_key(token_fingerprint)):
            raise RefreshTokenRevokedError
        metadata = _decode_token_metadata(await redis.get(_refresh_token_key(token_fingerprint)))

    if int(metadata["absolute_expires_at"]) <= int(now):
        await blacklist_token(redis, token)
        raise RefreshTokenInvalidError
    return metadata


async def create_refresh_token(
    redis: Redis | None,
    user_id: UUID4,
    *,
    absolute_expires_at: int | None = None,
) -> str:
    """Create a new refresh token.

    Args:
        redis: Redis client or None for in-memory fallback
        user_id: User's UUID
        absolute_expires_at: Existing absolute session expiry timestamp to preserve during rotation

    Returns:
        Refresh token string
    """
    token = _new_refresh_token()
    metadata = _build_token_metadata(
        user_id,
        absolute_expires_at=absolute_expires_at,
    )
    ttl = _metadata_ttl_seconds(metadata)
    if ttl <= 0:
        raise RefreshTokenInvalidError

    if redis is None:
        _memory_tokens[token] = metadata
        return token

    token_fingerprint = refresh_token_fingerprint(token)
    token_key = _refresh_token_key(token_fingerprint)
    user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{user_id}"
    await redis.setex(token_key, ttl, json.dumps(metadata, separators=(",", ":")))
    await redis_int(redis.sadd(user_tokens_key, token_fingerprint))
    await redis.expire(user_tokens_key, ttl)
    return token


async def verify_refresh_token(
    redis: Redis | None,
    token: str,
) -> UUID:
    """Verify a refresh token and return the user ID.

    Args:
        redis: Redis client
        token: Refresh token to verify

    Returns:
        UUID of the user

    Raises:
        RefreshTokenError: If token is invalid, expired, or blacklisted
    """
    metadata = await _load_active_token_metadata(redis, token)
    return UUID(str(metadata["user_id"]))


async def blacklist_token(
    redis: Redis | None,
    token: str,
    ttl_seconds: int | None = None,
) -> None:
    """Blacklist a refresh token and delete it.

    Args:
        redis: Redis client
        token: Refresh token to blacklist
        ttl_seconds: TTL for blacklist entry (if None, uses remaining token TTL)
    """
    token_fingerprint = refresh_token_fingerprint(token)
    token_key = _refresh_token_key(token_fingerprint)

    if redis is None:
        if ttl_seconds is None:
            token_data = _memory_tokens.get(token)
            ttl_seconds = max(int(int(token_data["absolute_expires_at"]) - time.time()), HOUR) if token_data else HOUR

        _memory_blacklist[token] = time.time() + ttl_seconds
        _memory_tokens.pop(token, None)
        return

    blacklist_key = _refresh_token_blacklist_key(token_fingerprint)

    if ttl_seconds is None:
        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = HOUR

    raw_token_metadata = await redis.get(token_key)
    token_metadata = _decode_token_metadata(raw_token_metadata) if raw_token_metadata else None

    await redis.setex(blacklist_key, ttl_seconds, "1")
    await redis.delete(token_key)

    if token_metadata:
        user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{token_metadata['user_id']}"
        await redis_int(redis.srem(user_tokens_key, token_fingerprint))


async def revoke_all_user_tokens(
    redis: Redis | None,
    user_id: UUID4,
) -> None:
    """Revoke all active refresh tokens for a user.

    Args:
        redis: Redis client or None for in-memory fallback
        user_id: User's UUID
    """
    user_id_str = str(user_id)

    if redis is None:
        tokens_to_revoke = [t for t, metadata in list(_memory_tokens.items()) if metadata["user_id"] == user_id_str]
        for token in tokens_to_revoke:
            await blacklist_token(redis, token)
        return

    user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{user_id_str}"
    tokens = await redis_str_set(redis.smembers(user_tokens_key))
    for stored_token_id in tokens:
        token_key = _refresh_token_key(stored_token_id)
        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = HOUR
        blacklist_key = _refresh_token_blacklist_key(stored_token_id)
        await redis.setex(blacklist_key, ttl_seconds, "1")
        await redis.delete(token_key)
    await redis.delete(user_tokens_key)


async def rotate_refresh_token(
    redis: Redis | None,
    old_token: str,
) -> str:
    """Rotate a refresh token (create new, blacklist old).

    Args:
        redis: Redis client
        old_token: Old refresh token

    Returns:
        New refresh token

    Raises:
        RefreshTokenError: If old token is invalid
    """
    metadata = await _load_active_token_metadata(redis, old_token)
    user_id = UUID(str(metadata["user_id"]))

    new_token = await create_refresh_token(
        redis,
        user_id,
        absolute_expires_at=int(metadata["absolute_expires_at"]),
    )

    # Blacklist old token; if it fails, invalidate the new token too so neither is usable
    try:
        await blacklist_token(redis, old_token)
    except Exception:
        await blacklist_token(redis, new_token)
        raise

    return new_token
