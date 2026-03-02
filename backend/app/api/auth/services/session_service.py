"""Session management service for tracking user devices and login sessions."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import UUID4, BaseModel

from app.api.auth.config import settings
from app.api.auth.services.refresh_token_service import blacklist_token

if TYPE_CHECKING:
    from redis.asyncio import Redis


class SessionInfo(BaseModel):
    """Session information model."""

    session_id: str
    device: str
    ip_address: str
    created_at: datetime
    last_used: datetime
    refresh_token_id: str
    is_current: bool = False


async def create_session(redis: Redis, user_id: UUID4, device_info: str, refresh_token_id: str, ip_address: str) -> str:
    """Create a new session for a user.

    Args:
        redis: Redis client
        user_id: User's UUID
        device_info: Device information from User-Agent header
        refresh_token_id: Associated refresh token ID
        ip_address: User's IP address

    Returns:
        session_id: Unique session identifier
    """
    session_id = secrets.token_urlsafe(settings.session_id_length)
    now = datetime.now(UTC).isoformat()
    user_id_str = str(user_id)

    session_data = {
        "device": device_info,
        "ip_address": ip_address,
        "created_at": now,
        "last_used": now,
        "refresh_token_id": refresh_token_id,
    }

    # Store session data
    session_key = f"session:{user_id_str}:{session_id}"
    await redis.setex(
        session_key,
        settings.refresh_token_expire_days * 86400,  # Match refresh token TTL
        json.dumps(session_data),
    )

    # Add session to user's session index
    user_sessions_key = f"user_sessions:{user_id_str}"
    # redis-py stubs incorrectly return Awaitable[int] | int instead of Awaitable[int]
    await redis.sadd(user_sessions_key, session_id)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client
    await redis.expire(user_sessions_key, settings.refresh_token_expire_days * 86400)

    return session_id


async def get_user_sessions(redis: Redis, user_id: UUID4, current_session_id: str | None = None) -> list[SessionInfo]:
    """Get all active sessions for a user.

    Args:
        redis: Redis client
        user_id: User's UUID
        current_session_id: Current session ID to mark as current (optional)

    Returns:
        List of SessionInfo objects
    """
    user_sessions_key = f"user_sessions:{user_id!s}"

    session_ids = await redis.smembers(user_sessions_key)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client

    user_id_str = str(user_id)
    sessions = []
    for session_id in session_ids:
        session_key = f"session:{user_id_str}:{session_id}"
        session_data_str = await redis.get(session_key)

        if session_data_str:
            session_data = json.loads(session_data_str)
            sessions.append(
                SessionInfo(
                    session_id=session_id,
                    device=session_data["device"],
                    ip_address=session_data["ip_address"],
                    created_at=datetime.fromisoformat(session_data["created_at"]),
                    last_used=datetime.fromisoformat(session_data["last_used"]),
                    refresh_token_id=session_data["refresh_token_id"],
                    is_current=(session_id == current_session_id),
                )
            )
        else:
            # Session expired but still in index, clean up
            await redis.srem(user_sessions_key, session_id)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client

    return sessions


async def update_session_activity(redis: Redis, session_id: str, user_id: UUID4) -> None:
    """Update the last_used timestamp for a session.

    Args:
        redis: Redis client
        session_id: Session identifier
        user_id: User's UUID
    """
    session_key = f"session:{user_id!s}:{session_id}"
    # redis-py stubs incorrectly return Awaitable[str | bytes | None] in a Union
    session_data_str = await redis.get(session_key)

    if session_data_str:
        session_data = json.loads(session_data_str)
        session_data["last_used"] = datetime.now(UTC).isoformat()

        # Reset TTL to full expiration time on activity
        # redis-py stubs incorrectly return Awaitable[bool] in a Union
        await redis.setex(
            session_key,
            settings.refresh_token_expire_days * 86400,
            json.dumps(session_data),
        )


async def revoke_session(redis: Redis, session_id: str, user_id: UUID4) -> None:
    """Revoke a specific session and blacklist its refresh token.

    Args:
        redis: Redis client
        session_id: Session identifier
        user_id: User's UUID
    """
    user_id_str = str(user_id)
    session_key = f"session:{user_id_str}:{session_id}"
    # redis-py stubs incorrectly return Awaitable[str | bytes | None] in a Union
    session_data_str = await redis.get(session_key)

    if session_data_str:
        session_data = json.loads(session_data_str)
        refresh_token_id = session_data["refresh_token_id"]

        # Blacklist the refresh token

        # redis-py stubs incorrectly return Awaitable[int] | int instead of Awaitable[int]
        ttl = await redis.ttl(session_key)
        await blacklist_token(redis, refresh_token_id, ttl)

    # Delete session
    # redis-py stubs incorrectly return Awaitable[int] | int instead of Awaitable[int]
    await redis.delete(session_key)

    # Remove from user's session index
    user_sessions_key = f"user_sessions:{user_id_str}"
    # redis-py stubs incorrectly return Awaitable[int] | int instead of Awaitable[int]
    await redis.srem(user_sessions_key, session_id)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client


async def revoke_all_sessions(redis: Redis, user_id: UUID4, except_current: str | None = None) -> int:
    """Revoke all sessions for a user, optionally except the current one.

    Args:
        redis: Redis client
        user_id: User's UUID
        except_current: Session ID to keep active (optional)

    Returns:
        Number of sessions revoked
    """
    user_sessions_key = f"user_sessions:{user_id!s}"
    session_ids = await redis.smembers(user_sessions_key)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client

    revoked_count = 0
    for session_id in session_ids:
        if session_id != except_current:
            await revoke_session(redis, session_id, user_id)
            revoked_count += 1

    return revoked_count
