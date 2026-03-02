"""Session management endpoints for viewing and revoking user sessions."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, status

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.services import refresh_token_service, session_service
from app.api.auth.services.session_service import SessionInfo
from app.core.redis import RedisDep

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/sessions",
    response_model=list[SessionInfo],
    summary="List active sessions",
    responses={
        status.HTTP_200_OK: {"description": "List of active sessions"},
        status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"},
    },
)
async def list_sessions(
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> list[SessionInfo]:
    """Get all active sessions for the current user.

    Shows device info, IP address, creation time, and last activity.
    Marks the current session based on the refresh token cookie.
    """
    current_session_id = None

    # Try to identify current session from refresh token
    if refresh_token:
        try:
            token_data = await refresh_token_service.verify_refresh_token(redis, refresh_token)
            current_session_id = token_data["session_id"]
        except HTTPException:
            # Invalid or expired token, can't identify current session
            pass

    # Get all sessions
    return await session_service.get_user_sessions(
        redis,
        current_user.id,
        current_session_id=current_session_id,
    )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a specific session",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Session revoked successfully"},
        status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"},
        status.HTTP_403_FORBIDDEN: {"description": "Session does not belong to user"},
        status.HTTP_404_NOT_FOUND: {"description": "Session not found"},
    },
)
async def revoke_session(
    session_id: str,
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
) -> None:
    """Revoke a specific session.

    This will:
    - Blacklist the associated refresh token
    - Delete the session from Redis
    - Force re-authentication on that device

    Note: The user can still use their current access token until it expires (max 15 minutes).
    """
    # Verify session belongs to user by checking if it exists in their session list
    user_sessions = await session_service.get_user_sessions(redis, current_user.id)
    session_exists = any(s.session_id == session_id for s in user_sessions)

    if not session_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or does not belong to you",
        )

    # Revoke the session
    await session_service.revoke_session(redis, session_id, current_user.id)
