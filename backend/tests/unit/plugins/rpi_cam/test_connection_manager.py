"""Unit tests for RPi camera WebSocket connection management."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager


async def test_unregister_fails_pending_command_futures() -> None:
    """Disconnecting a camera should unblock commands that are waiting for a response."""
    manager = CameraConnectionManager()
    camera_id = uuid4()
    websocket = AsyncMock()
    command_sent = asyncio.Event()
    websocket.send_text = AsyncMock(side_effect=lambda *_args, **_kwargs: command_sent.set())
    await manager.register(camera_id, websocket)

    command_task = asyncio.create_task(manager.send_command(camera_id, "GET", "/camera"))
    try:
        await asyncio.wait_for(command_sent.wait(), timeout=1)
        manager.unregister(camera_id)

        with pytest.raises(RuntimeError, match="disconnected before responding"):
            await command_task
    finally:
        if not command_task.done():
            command_task.cancel()
            await asyncio.gather(command_task, return_exceptions=True)
