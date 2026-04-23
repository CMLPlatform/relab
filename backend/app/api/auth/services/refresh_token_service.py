"""Refresh token service for managing long-lived authentication tokens.

This module supports both Redis-backed storage and an in-memory fallback
used when Redis is unavailable (convenient for local development).
"""
# spell-checker: ignore setex

from __future__ import annotations

import secrets
import time
from typing import TYPE_CHECKING, cast
from uuid import UUID

from pydantic import UUID4

from app.api.auth.config import settings
from app.api.auth.exceptions import RefreshTokenInvalidError, RefreshTokenRevokedError
from app.core.constants import HOUR

if TYPE_CHECKING:
    from collections.abc import Awaitable

    from redis.asyncio import Redis


# In-memory stores used when Redis is not available. Keys are the raw token strings.
# Values for _memory_tokens: token -> (user_id_str, expire_ts)
# Values for _memory_blacklist: token -> expire_ts
_memory_tokens: dict[str, tuple[str, float]] = {}
_memory_blacklist: dict[str, float] = {}

_USER_TOKENS_KEY_PREFIX = "auth:rt:user:"


async def create_refresh_token(
    redis: Redis | None,
    user_id: UUID4,
) -> str:
    """Create a new refresh token.

    Args:
        redis: Redis client or None for in-memory fallback
        user_id: User's UUID

    Returns:
        Refresh token string
    """
    token = secrets.token_urlsafe(48)

    ttl = settings.refresh_token_expire_days * 86400

    if redis is None:
        expire_ts = time.time() + ttl
        _memory_tokens[token] = (str(user_id), expire_ts)
        return token

    # Store token with user_id mapping in Redis and add to user's token set
    token_key = f"auth:rt:{token}"
    user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{user_id}"
    await redis.setex(token_key, ttl, str(user_id))
    await cast("Awaitable[int]", redis.sadd(user_tokens_key, token))
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
    # Check if token is blacklisted
    if redis is None:
        # In-memory blacklist check
        bl_expire = _memory_blacklist.get(token)
        if bl_expire and bl_expire > time.time():
            raise RefreshTokenRevokedError
    else:
        blacklist_key = f"auth:rt_blacklist:{token}"
        if await redis.exists(blacklist_key):
            raise RefreshTokenRevokedError

    if redis is None:
        token_data = _memory_tokens.get(token)
        if not token_data or token_data[1] <= time.time():
            raise RefreshTokenInvalidError
        user_id_str = token_data[0]
    else:
        token_key = f"auth:rt:{token}"
        user_id_str = await redis.get(token_key)

        if not user_id_str:
            raise RefreshTokenInvalidError

    return UUID(user_id_str if isinstance(user_id_str, str) else user_id_str.decode("utf-8"))


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
    token_key = f"auth:rt:{token}"

    if redis is None:
        # Determine ttl from token if not provided
        if ttl_seconds is None:
            token_data = _memory_tokens.get(token)
            ttl_seconds = max(int(token_data[1] - time.time()), HOUR) if token_data else HOUR

        _memory_blacklist[token] = time.time() + ttl_seconds
        _memory_tokens.pop(token, None)
        return

    if ttl_seconds is None:
        # Get remaining TTL from the token itself
        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = HOUR  # Default 1 hour if token already expired

    # Get user_id before deleting the token key (needed to clean up user set)
    user_id_str = await redis.get(token_key)

    # Add to blacklist and delete the token
    blacklist_key = f"auth:rt_blacklist:{token}"
    await redis.setex(blacklist_key, ttl_seconds, "1")
    await redis.delete(token_key)

    # Remove from user's token set
    if user_id_str:
        user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{user_id_str}"
        await cast("Awaitable[int]", redis.srem(user_tokens_key, token))


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
        tokens_to_revoke = [t for t, (uid, _) in list(_memory_tokens.items()) if uid == user_id_str]
        for token in tokens_to_revoke:
            await blacklist_token(redis, token)
        return

    user_tokens_key = f"{_USER_TOKENS_KEY_PREFIX}{user_id_str}"
    tokens = await cast("Awaitable[set[str]]", redis.smembers(user_tokens_key))
    for token in tokens:
        token_key = f"auth:rt:{token}"
        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = HOUR
        blacklist_key = f"auth:rt_blacklist:{token}"
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
    # Verify old token
    user_id = await verify_refresh_token(redis, old_token)

    # Create new token
    new_token = await create_refresh_token(redis, user_id)

    # Blacklist old token; if it fails, invalidate the new token too so neither is usable
    try:
        await blacklist_token(redis, old_token)
    except Exception:
        await blacklist_token(redis, new_token)
        raise

    return new_token
