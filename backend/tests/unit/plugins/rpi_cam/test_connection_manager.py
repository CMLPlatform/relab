"""Unit tests for RPi camera WebSocket connection management."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock
from uuid import uuid4

import relab_rpi_cam_models as relay_models

from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

if TYPE_CHECKING:
    import pytest


@dataclass
class _RelayCommand:
    payload: dict

    def model_dump_json(self) -> str:
        return json.dumps(self.payload)


async def test_send_command_uses_model_package_command_builder_and_resolves_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Command serialization should use the shared model package boundary."""
    monkeypatch.setattr(
        relay_models,
        "build_relay_command",
        lambda msg_id, method, path, params, body, headers: _RelayCommand(
            {
                "id": msg_id,
                "method": method,
                "path": path,
                "params": params or {},
                "body": body,
                "headers": headers or {},
            }
        ),
        raising=False,
    )
    manager = CameraConnectionManager()
    camera_id = uuid4()
    websocket = AsyncMock()
    command_sent = asyncio.Event()
    websocket.send_text = AsyncMock(side_effect=lambda *_args, **_kwargs: command_sent.set())
    await manager.register(camera_id, websocket)

    command_task = asyncio.create_task(manager.send_command(camera_id, "GET", "/camera"))
    try:
        await asyncio.wait_for(command_sent.wait(), timeout=1)
        assert websocket.send_text.await_args is not None
        payload = json.loads(websocket.send_text.await_args.args[0])
        manager.resolve_json(payload["id"], {"status": 200, "data": {"ok": True}}, None)

        assert await command_task == ({"status": 200, "data": {"ok": True}}, None)
        assert payload["method"] == "GET"
        assert payload["path"] == "/camera"
    finally:
        if not command_task.done():
            command_task.cancel()
            await asyncio.gather(command_task, return_exceptions=True)
