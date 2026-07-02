"""Unit tests for Raspberry Pi camera CRUD routes."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import BackgroundTasks

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraStatus
from app.api.plugins.rpi_cam.routers.camera_crud import _notify_camera_unpair, delete_user_camera


async def test_delete_user_camera_schedules_unpair_notification(mock_camera: Camera) -> None:
    """Deleting a camera should commit first and queue the unpair notification in the background."""
    session = AsyncMock()
    background_tasks = MagicMock(spec=BackgroundTasks)

    with patch("app.api.plugins.rpi_cam.routers.camera_crud._notify_camera_unpair") as mock_notify:
        await delete_user_camera(
            background_tasks=background_tasks,
            db=session,
            camera=mock_camera,
            redis=None,
        )

    session.delete.assert_awaited_once_with(mock_camera)
    session.commit.assert_awaited_once()
    assert background_tasks.add_task.call_args_list[0].args[0] is mock_notify
    assert background_tasks.add_task.call_args_list[0].args[1:] == (mock_camera.id, None)
    mock_notify.assert_not_called()


async def test_notify_camera_unpair_skips_relay_when_camera_is_offline() -> None:
    """Offline cameras should not wait on relay timeout during delete cleanup."""
    camera_id = uuid4()

    with (
        patch(
            "app.api.plugins.rpi_cam.routers.camera_crud.fetch_camera_status",
            new=AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.OFFLINE)),
        ),
        patch("app.api.plugins.rpi_cam.routers.camera_crud.relay_via_websocket", new=AsyncMock()) as relay_mock,
    ):
        await _notify_camera_unpair(camera_id, None)

    relay_mock.assert_not_awaited()


async def test_notify_camera_unpair_relays_when_camera_is_online() -> None:
    """Online cameras should still receive the best-effort unpair command."""
    camera_id = uuid4()

    with (
        patch(
            "app.api.plugins.rpi_cam.routers.camera_crud.fetch_camera_status",
            new=AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.ONLINE)),
        ),
        patch("app.api.plugins.rpi_cam.routers.camera_crud.relay_via_websocket", new=AsyncMock()) as relay_mock,
    ):
        await _notify_camera_unpair(camera_id, None)

    relay_mock.assert_awaited_once_with(camera_id, "DELETE", "/pairing", redis=None)
