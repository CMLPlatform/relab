"""Unit tests for Raspberry Pi camera CRUD routes."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_crud import delete_user_camera

if TYPE_CHECKING:
    from redis.asyncio import Redis


@pytest.mark.asyncio
async def test_delete_user_camera_schedules_unpair_notification() -> None:
    """Deleting a camera should commit first and queue the unpair notification in the background."""
    camera_id = uuid4()
    camera = cast("Camera", SimpleNamespace(id=camera_id))
    session = AsyncMock()
    background_tasks = MagicMock(spec=BackgroundTasks)
    redis = cast("Redis | None", object())

    with patch("app.api.plugins.rpi_cam.routers.camera_crud._notify_camera_unpair") as mock_notify:
        await delete_user_camera(
            background_tasks=background_tasks,
            db=session,
            camera=camera,
            redis=redis,
        )

    session.delete.assert_awaited_once_with(camera)
    session.commit.assert_awaited_once()
    background_tasks.add_task.assert_called_once_with(mock_notify, camera_id, redis)
    mock_notify.assert_not_called()
