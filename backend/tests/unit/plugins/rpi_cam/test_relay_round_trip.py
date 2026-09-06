"""Composition test for one relay command travelling to a camera and back.

Each link in this chain has its own tests, all of which mock the link below:
``relay_via_websocket`` mocks the connection manager, and the manager's tests
resolve futures by hand rather than parsing a frame. Nothing exercised the whole
path, which is where covered pieces stop agreeing with each other. This drives a
real ``CameraConnectionManager`` and a real ``_RelayWebSocketSession`` against a
fake Pi that answers on the socket, so command correlation, envelope parsing and
response ownership all have to line up for the test to pass.
"""

import asyncio
import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from relab_rpi_cam_models import RelayMessageType

from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.message_relay import relay_via_websocket
from app.api.plugins.rpi_cam.websocket.router import _RelayWebSocketSession

_RELAY_MODULE = "app.api.plugins.rpi_cam.websocket.message_relay"
_ALLOWED_COMMAND = ("GET", "/system/local-access")


@pytest.fixture(autouse=True)
def _fast_relay_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail fast rather than waiting out the production relay deadline.

    A regression that stops answers reaching the caller leaves these commands
    unanswered, so at the real timeout the module would hang CI for 30s per test
    instead of reporting the break.
    """
    monkeypatch.setattr(f"{_RELAY_MODULE}.DEFAULT_COMMAND_TIMEOUT", 0.05)


def _fake_pi(session: _RelayWebSocketSession, payload: dict | None = None) -> AsyncMock:
    """A socket that answers each relay command the way a paired Pi would.

    The answer is attributed to whichever camera owns ``session``, so passing a
    session for a different camera makes the reply come from the wrong device.
    """
    websocket = AsyncMock()

    async def answer(raw_command: str) -> None:
        command = json.loads(raw_command)
        await session.handle_text_frame(
            json.dumps(
                {
                    "id": command["id"],
                    "type": RelayMessageType.RESPONSE,
                    "status": 200,
                    "data": payload if payload is not None else {"api_key": "local-key"},
                }
            )
        )

    websocket.send_text = AsyncMock(side_effect=answer)
    return websocket


def _session(camera_id: object, manager: CameraConnectionManager) -> _RelayWebSocketSession:
    return _RelayWebSocketSession(camera_id=camera_id, manager=manager, redis=AsyncMock())


async def test_a_relay_command_reaches_the_camera_and_its_answer_reaches_the_caller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The full path must carry a command out and the matching answer back."""
    manager = CameraConnectionManager()
    camera_id = uuid4()
    session = _session(camera_id, manager)
    websocket = _fake_pi(session)
    await manager.register(camera_id, websocket)
    monkeypatch.setattr(f"{_RELAY_MODULE}.get_connection_manager", lambda: manager)

    method, path = _ALLOWED_COMMAND
    response = await relay_via_websocket(camera_id, method, path, redis=AsyncMock())

    assert response.status_code == 200
    assert response.json() == {"api_key": "local-key"}
    sent = json.loads(websocket.send_text.await_args.args[0])
    assert (sent["method"], sent["path"]) == (method, path)


async def test_a_second_camera_cannot_answer_another_cameras_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An answer is only accepted from the camera the command was sent to.

    ``msg_id`` arrives from the socket and is attacker-controlled by any paired
    device, so a camera replaying another's id must not have its payload handed
    to the waiting caller.
    """
    manager = CameraConnectionManager()
    camera_id = uuid4()
    impostor_id = uuid4()
    # The impostor owns the session that answers, so the frame is attributed to it.
    impostor_session = _session(impostor_id, manager)
    websocket = _fake_pi(impostor_session, payload={"api_key": "stolen"})
    await manager.register(camera_id, websocket)
    monkeypatch.setattr(f"{_RELAY_MODULE}.get_connection_manager", lambda: manager)

    method, path = _ALLOWED_COMMAND
    with pytest.raises(HTTPException, match="did not respond in time"):
        await relay_via_websocket(camera_id, method, path, redis=AsyncMock())


async def test_a_camera_dropping_mid_command_fails_the_caller_immediately(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A disconnect must fail the waiting caller, not leave it on the relay deadline.

    ``unregister`` sets an exception on every future the camera still owes, which is
    what turns a dropped camera into a prompt 503. Without it the request would sit
    until the relay timeout expires, holding a worker for the full deadline while the
    camera is already known to be gone.
    """
    # Restore a deadline long enough that only the disconnect can end this command:
    # under the shortened one, the timeout path returns an indistinguishable 503.
    monkeypatch.setattr(f"{_RELAY_MODULE}.DEFAULT_COMMAND_TIMEOUT", 30.0)
    manager = CameraConnectionManager()
    camera_id = uuid4()
    websocket = AsyncMock()
    command_sent = asyncio.Event()
    # Accept the command and never answer: the camera drops while it is still pending.
    websocket.send_text = AsyncMock(side_effect=lambda *_a, **_kw: command_sent.set())
    await manager.register(camera_id, websocket)
    monkeypatch.setattr(f"{_RELAY_MODULE}.get_connection_manager", lambda: manager)

    method, path = _ALLOWED_COMMAND
    command = asyncio.create_task(relay_via_websocket(camera_id, method, path, redis=AsyncMock()))
    try:
        await asyncio.wait_for(command_sent.wait(), timeout=1)
        assert manager.unregister(camera_id, websocket)

        with pytest.raises(HTTPException) as excinfo:
            await asyncio.wait_for(command, timeout=1)
    finally:
        if not command.done():
            command.cancel()
            await asyncio.gather(command, return_exceptions=True)

    assert excinfo.value.status_code == 503
    assert "Retry-After" in excinfo.value.headers
    # Must be the disconnect response, not the deadline expiring on a still-pending command.
    assert excinfo.value.detail == "Camera is not connected via WebSocket."
