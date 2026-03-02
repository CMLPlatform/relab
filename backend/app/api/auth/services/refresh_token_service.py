"""Refresh token service for managing long-lived authentication tokens."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
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
    session_id: str,
) -> str:
    """Create a new refresh token.

    Args:
        redis: Redis client
        user_id: User's UUID
        session_id: Associated session ID

    Returns:
        Refresh token string
    """
    token = secrets.token_urlsafe(48)
    now = datetime.now(UTC).isoformat()

    token_data = {
        "user_id": str(user_id),
        "session_id": session_id,
        "created_at": now,
    }

    # Store token data
    token_key = f"refresh_token:{token}"
    await redis.setex(
        token_key,
        settings.refresh_token_expire_days * 86400,  # TTL in seconds
        json.dumps(token_data),
    )

    # Add token to user's token index (for bulk revocation)
    user_tokens_key = f"user_refresh_tokens:{user_id}"

    await redis.sadd(user_tokens_key, token)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client
    await redis.expire(user_tokens_key, settings.refresh_token_expire_days * 86400)

    return token


async def verify_refresh_token(
    redis: Redis,
    token: str,
) -> dict:
    """Verify a refresh token and return its data.

    Args:
        redis: Redis client
        token: Refresh token to verify

    Returns:
        dict with user_id and session_id

    Raises:
        HTTPException: If token is invalid, expired, or blacklisted
    """
    # Check if token is blacklisted
    blacklist_key = f"blacklist:{token}"
    if await redis.exists(blacklist_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    # Get token data
    token_key = f"refresh_token:{token}"
    token_data_str = await redis.get(token_key)

    if not token_data_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    token_data = json.loads(token_data_str)
    return {
        "user_id": UUID(token_data["user_id"]),
        "session_id": token_data["session_id"],
    }


async def blacklist_token(
    redis: Redis,
    token: str,
    ttl_seconds: int | None = None,
) -> None:
    """Blacklist a refresh token.

    Args:
        redis: Redis client
        token: Refresh token to blacklist
        ttl_seconds: TTL for blacklist entry (if None, uses remaining token TTL)
    """
    if ttl_seconds is None:
        # Get remaining TTL from the token itself
        token_key = f"refresh_token:{token}"

        ttl_seconds = await redis.ttl(token_key)
        if ttl_seconds <= 0:
            ttl_seconds = 3600  # Default 1 hour if token already expired

    # Add to blacklist
    blacklist_key = f"blacklist:{token}"
    # redis-py stubs incorrectly return Awaitable[int | bool] instead of Awaitable[bool]
    await redis.setex(blacklist_key, ttl_seconds, "1")

    # Delete the token
    token_key = f"refresh_token:{token}"
    # redis-py stubs incorrectly return Awaitable[str | bytes | None] in a Union
    token_data_str = await redis.get(token_key)
    if token_data_str:
        token_data = json.loads(token_data_str)
        user_id = token_data["user_id"]

        # Remove from user's token index
        user_tokens_key = f"user_refresh_tokens:{user_id}"

        await redis.srem(user_tokens_key, token)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client

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
    token_data = await verify_refresh_token(redis, old_token)

    # Create new token
    new_token = await create_refresh_token(
        redis,
        token_data["user_id"],
        token_data["session_id"],
    )

    # Blacklist old token
    await blacklist_token(redis, old_token)

    return new_token
