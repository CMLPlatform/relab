"""Unit tests for session service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from app.api.auth.services.session_service import (
    create_session,
    get_user_sessions,
    revoke_all_sessions,
    revoke_session,
    update_session_activity,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

# Constants for test values to avoid magic value warnings
# secrets.token_urlsafe(32) generates 32 bytes encoded as base64url = ~43 characters
SESSION_ID_LENGTH = 43
DEVICE_INFO = "Desktop Chrome 120.0 (Windows 10)"
IP_ADDRESS = "10.0.0.1"


@pytest.mark.asyncio
class TestSessionService:
    """Tests for session management in Redis."""

    async def test_create_session(self, redis_client: Redis) -> None:
        """Test creating a new session."""
        user_id = uuid.uuid4()
        device_info = "Mobile Safari 16.0 (iOS 16.0)"
        ip_address = "192.168.1.100"
        # Renamed to avoid S105
        rt_id = "test-refresh-token-ID-999"

        session_id = await create_session(redis_client, user_id, device_info, rt_id, ip_address)

        # Session ID should be 32 characters
        assert len(session_id) == SESSION_ID_LENGTH

        # Verify session data in Redis
        stored_data = await redis_client.get(f"session:{user_id!s}:{session_id}")
        assert stored_data is not None
        assert device_info in stored_data
        assert ip_address in stored_data
        assert rt_id in stored_data

        # Verify session ID is in user's session set
        user_sessions_key = f"user_sessions:{user_id!s}"
        sessions = await redis_client.smembers(user_sessions_key)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client
        assert session_id in sessions

    async def test_get_user_sessions_empty(self, redis_client: Redis) -> None:
        """Test getting sessions when user has none."""
        user_id = uuid.uuid4()

        sessions = await get_user_sessions(redis_client, user_id)

        assert sessions == []

    async def test_get_user_sessions_single(self, redis_client: Redis) -> None:
        """Test getting a single session."""
        user_id = uuid.uuid4()
        device_info = DEVICE_INFO
        ip_address = "10.0.0.50"
        rt_id = "test-token-123"

        session_id = await create_session(redis_client, user_id, device_info, rt_id, ip_address)

        sessions = await get_user_sessions(redis_client, user_id)

        assert len(sessions) == 1
        assert sessions[0].session_id == session_id
        assert sessions[0].device == device_info
        assert sessions[0].ip_address == ip_address

    async def test_get_user_sessions_multiple(self, redis_client: Redis) -> None:
        """Test getting multiple sessions for a user."""
        user_id = uuid.uuid4()

        # Create sessions from different devices
        session_1 = await create_session(redis_client, user_id, "Chrome", "token-1", "10.0.0.1")
        session_2 = await create_session(redis_client, user_id, "Firefox", "token-2", "10.0.0.2")

        sessions = await get_user_sessions(redis_client, user_id)

        assert len(sessions) == 2
        session_ids = [s.session_id for s in sessions]
        assert session_1 in session_ids
        assert session_2 in session_ids

    async def test_update_session_activity(self, redis_client: Redis) -> None:
        """Test updating session last_used timestamp."""
        user_id = uuid.uuid4()
        device_info = DEVICE_INFO
        ip_address = IP_ADDRESS
        rt_id = "test-token-123"

        session_id = await create_session(redis_client, user_id, device_info, rt_id, ip_address)

        # Update activity
        await update_session_activity(redis_client, session_id, user_id)

        # Verify timestamp updated
        session_data = await get_user_sessions(redis_client, user_id)
        last_used = session_data[0].last_used

        # Should be very recent
        assert (datetime.now(UTC) - last_used.replace(tzinfo=UTC)).total_seconds() < 5

    async def test_revoke_session(self, redis_client: Redis) -> None:
        """Test revoking a specific session."""
        user_id = uuid.uuid4()
        device_info = DEVICE_INFO
        ip_address = IP_ADDRESS
        rt_id = "test-token-123"

        session_id = await create_session(redis_client, user_id, device_info, rt_id, ip_address)

        # Revoke the session
        await revoke_session(redis_client, session_id, user_id)

        # Session data should be gone
        stored_data = await redis_client.get(f"session:{user_id!s}:{session_id}")
        assert stored_data is None

        # Session ID should be removed from user's session set
        user_sessions_key = f"user_sessions:{user_id!s}"
        sessions = await redis_client.smembers(user_sessions_key)  # type: ignore[invalid-await] # redis-py stubs incorrectly include synchronous return types in the async client
        assert session_id not in sessions

    async def test_revoke_session_nonexistent(self, redis_client: Redis) -> None:
        """Test revoking a non-existent session (should not raise error)."""
        user_id = uuid.uuid4()
        fake_session_id = "nonexistent-session-id-12345678"

        # Should not raise an error
        await revoke_session(redis_client, fake_session_id, user_id)

    async def test_revoke_all_sessions(self, redis_client: Redis) -> None:
        """Test revoking all sessions for a user."""
        user_id = uuid.uuid4()

        # Create multiple sessions
        await create_session(redis_client, user_id, "Device 1", "token-1", "10.0.0.1")
        await create_session(redis_client, user_id, "Device 2", "token-2", "10.0.0.2")

        # Revoke all
        await revoke_all_sessions(redis_client, user_id)

        # User's session set should be empty
        sessions = await get_user_sessions(redis_client, user_id)
        assert sessions == []

        # User key should be deleted
        exists = await redis_client.exists(f"user_sessions:{user_id!s}")
        assert not exists

    async def test_revoke_all_sessions_except_current(self, redis_client: Redis) -> None:
        """Test revoking all sessions except the current one."""
        user_id = uuid.uuid4()

        # Create multiple sessions
        await create_session(redis_client, user_id, "Device 1", "token-1", "10.0.0.1")
        current_session_id = await create_session(redis_client, user_id, "Current Device", "current-token", "10.0.0.3")
        await create_session(redis_client, user_id, "Device 2", "token-2", "10.0.0.2")

        # Revoke all except current
        await revoke_all_sessions(redis_client, user_id, except_current=current_session_id)

        # User should have only one session
        sessions = await get_user_sessions(redis_client, user_id)
        assert len(sessions) == 1
        assert sessions[0].session_id == current_session_id

        # Current session data should still exist
        exists = await redis_client.exists(f"session:{user_id!s}:{current_session_id}")
        assert exists
