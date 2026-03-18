"""Refresh token service for managing long-lived authentication tokens."""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import UUID4

from app.api.auth.config import settings

if TYPE_CHECKING:
    from redis.asyncio import Redis


async def create_refresh_token(
    redis: Redis,
    user_id: UUID4,
) -> str:
    """Create a new refresh token.

    Args:
        redis: Redis client
        user_id: User's UUID

    Returns:
        Refresh token string
    """
    token = secrets.token_urlsafe(48)

    # Store token with user_id mapping
    token_key = f"auth:rt:{token}"
    await redis.setex(
        token_key,
        settings.refresh_token_expire_days * 86400,  # TTL in seconds
        str(user_id),
    )

    return token


async def verify_refresh_token(
    redis: Redis,
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
    blacklist_key = f"auth:rt_blacklist:{token}"
    if await redis.exists(blacklist_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    # Get token data
    token_key = f"auth:rt:{token}"
    user_id_str = await redis.get(token_key)

    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    return UUID(user_id_str if isinstance(user_id_str, str) else user_id_str.decode("utf-8"))


async def blacklist_token(
    redis: Redis,
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

    if ttl_seconds is None:
        # Get remaining TTL from the token itself
        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = 3600  # Default 1 hour if token already expired

    # Add to blacklist
    blacklist_key = f"auth:rt_blacklist:{token}"
    await redis.setex(blacklist_key, ttl_seconds, "1")

    # Delete the token
    await redis.delete(token_key)


async def rotate_refresh_token(
    redis: Redis,
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
