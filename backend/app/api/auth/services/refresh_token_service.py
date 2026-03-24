"""Refresh token service for managing long-lived authentication tokens.

This module supports both Redis-backed storage and an in-memory fallback
used when Redis is unavailable (convenient for local development).
"""
# spell-checker: ignore setex

from __future__ import annotations

import secrets
import time
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import UUID4

from app.api.auth.config import settings
from app.core.constants import HOUR

if TYPE_CHECKING:
    from redis.asyncio import Redis


# In-memory stores used when Redis is not available. Keys are the raw token strings.
# Values for _memory_tokens: token -> (user_id_str, expire_ts)
# Values for _memory_blacklist: token -> expire_ts
_memory_tokens: dict[str, tuple[str, float]] = {}
_memory_blacklist: dict[str, float] = {}


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

    # Store token with user_id mapping in Redis
    token_key = f"auth:rt:{token}"
    await redis.setex(token_key, ttl, str(user_id))
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
        HTTPException: If token is invalid, expired, or blacklisted
    """
    # Check if token is blacklisted
    if redis is None:
        # In-memory blacklist check
        bl_expire = _memory_blacklist.get(token)
        if bl_expire and bl_expire > time.time():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )
    else:
        blacklist_key = f"auth:rt_blacklist:{token}"
        if await redis.exists(blacklist_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )

    if redis is None:
        token_data = _memory_tokens.get(token)
        if not token_data or token_data[1] <= time.time():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )
        user_id_str = token_data[0]
    else:
        token_key = f"auth:rt:{token}"
        user_id_str = await redis.get(token_key)

        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

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

    # Add to blacklist
    blacklist_key = f"auth:rt_blacklist:{token}"
    await redis.setex(blacklist_key, ttl_seconds, "1")

    # Delete the token
    await redis.delete(token_key)


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
        HTTPException: If old token is invalid
    """
    # Verify old token
    user_id = await verify_refresh_token(redis, old_token)

    # Create new token
    new_token = await create_refresh_token(redis, user_id)

    # Blacklist old token
    await blacklist_token(redis, old_token)

    return new_token
