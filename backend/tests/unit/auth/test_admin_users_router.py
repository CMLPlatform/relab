"""Unit tests for admin user router helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.api.auth.models import User
from app.api.auth.routers.admin.users import delete_user
from app.api.common.audit import AuditAction


async def test_delete_user_emits_single_route_level_audit_event() -> None:
    """Admin user deletion should audit with the acting superuser as actor."""
    user_id = uuid4()
    actor_id = uuid4()
    user = MagicMock()
    actor = MagicMock()
    actor.id = actor_id
    user_manager = MagicMock()
    user_manager.get = AsyncMock(return_value=user)
    user_manager.delete = AsyncMock()

    with patch("app.api.auth.routers.admin.users.audit_event") as log_audit:
        await delete_user(user_id, user_manager, actor)

    user_manager.get.assert_awaited_once_with(user_id)
    user_manager.delete.assert_awaited_once_with(user)
    log_audit.assert_called_once_with(actor_id, AuditAction.DELETE, User, user_id)
