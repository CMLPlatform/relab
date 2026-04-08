"""Unit tests for the RPi camera pairing router."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fakeredis.aioredis import FakeRedis
from starlette.requests import Request

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.pairing import claim_pairing_code, poll_pairing_status, register_pairing_code
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str
from tests.factories.models import UserFactory


def build_camera() -> Camera:
    """Build a camera database model stub."""
    return Camera(
        id=uuid4(),
        name="Test Camera",
        url="http://example.com",
        encrypted_api_key=encrypt_str("secret"),
        owner_id=uuid4(),
    )


def build_request() -> Request:
    """Build a minimal Starlette request for router tests."""
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "query_string": b""})


async def test_register_pairing_code_sanitizes_code_in_log() -> None:
    """Register logging should neutralize line breaks in the pairing code."""
    body = SimpleNamespace(code="ABCD\n12", rpi_fingerprint="fingerprint")
    redis_client = await _make_fake_redis()

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger,
    ):
        response = await register_pairing_code(
            request=build_request(),
            body=body,
            redis=redis_client,
        )

    assert response.code == body.code
    mock_logger.info.assert_called_once_with("Pairing code %s registered.", "ABCD 12")
    stored = await redis_client.get("rpi_cam:pairing:ABCD\n12")
    assert stored is not None


async def test_claim_pairing_code_sanitizes_code_in_log() -> None:
    """Claim logging should neutralize line breaks in the pairing code."""
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    camera = build_camera()
    body = SimpleNamespace(code="ABCD\r\n12", camera_name="Camera", description="Description")
    redis_client = await _make_fake_redis()
    await redis_client.set(
        "rpi_cam:pairing:ABCD\r\n12",
        json.dumps({"status": "waiting"}),
    )

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.crud.create_camera", new=AsyncMock(return_value=camera)),
        patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger,
    ):
        response = await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    assert response.id == camera.id
    assert mock_logger.info.call_args.args[1] == "ABCD  12"
    stored = await redis_client.get("rpi_cam:pairing:ABCD\r\n12")
    assert stored is not None


async def test_poll_pairing_status_sanitizes_code_in_log() -> None:
    """Polling logs should neutralize line breaks in the pairing code."""
    body_code = "ABCD\n12"
    redis_client = await _make_fake_redis()
    await redis_client.set(
        "rpi_cam:pairing:ABCD\n12",
        json.dumps({"status": "paired", "camera_id": "1", "api_key": "2", "ws_url": "3"}),
    )

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger,
    ):
        response = await poll_pairing_status(
            request=build_request(),
            redis=redis_client,
            code=body_code,
            fingerprint="fingerprint",
        )

    assert response.status == "paired"
    mock_logger.info.assert_called_once_with("Pairing credentials retrieved for code %s.", "ABCD 12")
    assert await redis_client.get("rpi_cam:pairing:ABCD\n12") is None


async def _make_fake_redis() -> FakeRedis:
    """Build a fake Redis client for unit tests."""
    return FakeRedis(decode_responses=True, version=7)
