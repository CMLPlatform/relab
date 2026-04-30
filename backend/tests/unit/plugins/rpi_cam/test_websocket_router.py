"""Unit tests for the RPi camera WebSocket router."""

from __future__ import annotations

import base64
import secrets
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.api.auth.services.rate_limiter import RateLimitExceededError
from app.api.plugins.rpi_cam.device_assertion import verify_device_assertion as _verify_device_assertion
from app.api.plugins.rpi_cam.websocket.router import (
    _authenticate,
    _handle_text_frame,
    _heartbeat_loop,
    _receive_loop,
)


async def test_handle_text_frame_sanitizes_camera_id_in_log() -> None:
    """Invalid JSON logging should neutralize line breaks in camera IDs."""
    camera_id = uuid4()
    manager = MagicMock(spec=[])

    with patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger:
        result = await _handle_text_frame(
            raw={"text": "{not-json"},
            camera_id=camera_id,
            manager=manager,
            pending_id=None,
            pending_json=None,
            last_pong_at=[0.0],
            redis=None,
        )

    assert result == (None, None)
    mock_logger.warning.assert_called_once_with("Camera %s sent invalid JSON, ignoring.", str(camera_id))


async def test_authenticate_sanitizes_client_ip_when_blocked() -> None:
    """Blocked auth logging should neutralize line breaks in the client IP."""
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10\nFORGED")
    websocket.close = AsyncMock()
    camera_id = uuid4()

    with (
        patch("app.api.plugins.rpi_cam.websocket.router.limiter") as mock_limiter,
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        mock_limiter.hit_key.side_effect = RateLimitExceededError
        result = await _authenticate(websocket, camera_id)

    assert result is False
    websocket.close.assert_awaited_once()
    mock_logger.warning.assert_called_once_with(
        "WebSocket auth from %s for camera %s blocked by rate limit.",
        "203.0.113.10 FORGED",
        str(camera_id),
    )


async def test_authenticate_enforces_redis_backed_rate_limit_before_auth_lookup() -> None:
    """WebSocket auth attempts should use the shared limiter so limits work across workers."""
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10")
    websocket.close = AsyncMock()
    camera_id = uuid4()

    with patch("app.api.plugins.rpi_cam.websocket.router.limiter", create=True) as mock_limiter:
        result = await _authenticate(websocket, camera_id)

    assert result is False
    mock_limiter.hit_key.assert_any_call("10/minute", "rpi-cam:ws-auth:ip:203.0.113.10")
    mock_limiter.hit_key.assert_any_call("10/minute", f"rpi-cam:ws-auth:camera:{camera_id}")


async def test_heartbeat_loop_sanitizes_camera_id_on_timeout() -> None:
    """Heartbeat timeout logging should neutralize line breaks in camera IDs."""
    websocket = MagicMock()
    websocket.close = AsyncMock()
    websocket.send_text = AsyncMock()
    camera_id = uuid4()
    last_pong_at = [0.0]

    with (
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.sleep", new=AsyncMock()),
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.get_running_loop") as mock_loop,
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        mock_loop.return_value.time.return_value = 91.0
        await _heartbeat_loop(websocket, camera_id, last_pong_at)

    websocket.close.assert_awaited_once_with(code=1001)
    mock_logger.warning.assert_called_once_with(
        "Camera %s heartbeat timeout (%.0fs since last pong); closing.",
        str(camera_id),
        91.0,
    )


async def test_receive_loop_closes_on_oversized_text_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    """Oversized WebSocket text frames should close before JSON parsing or dispatch."""
    monkeypatch.setattr("app.api.plugins.rpi_cam.websocket.router.settings.rpi_cam_ws_text_frame_limit_bytes", 8)
    websocket = AsyncMock()
    websocket.receive = AsyncMock(
        side_effect=[
            {"type": "websocket.receive", "text": "x" * 9},
            {"type": "websocket.disconnect"},
        ]
    )
    websocket.close = AsyncMock()

    await _receive_loop(websocket, uuid4(), MagicMock(), [0.0], None)

    websocket.close.assert_awaited_once()


async def test_receive_loop_closes_on_oversized_binary_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    """Oversized WebSocket binary frames should close before being retained in memory."""
    monkeypatch.setattr("app.api.plugins.rpi_cam.websocket.router.settings.rpi_cam_ws_binary_frame_limit_bytes", 8)
    websocket = AsyncMock()
    websocket.receive = AsyncMock(
        side_effect=[
            {"type": "websocket.receive", "bytes": b"x" * 9},
            {"type": "websocket.disconnect"},
        ]
    )
    websocket.close = AsyncMock()

    await _receive_loop(websocket, uuid4(), MagicMock(), [0.0], None)

    websocket.close.assert_awaited_once()


# ── Device assertion verification ────────────────────────────────────────────

_ALG = "ES256"
_AUD = "relab-rpi-cam-relay"


def _make_key() -> tuple[ec.EllipticCurvePrivateKey, dict]:
    """Generate an EC P-256 key pair and return (private_key, public_jwk)."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    pub = private_key.public_key().public_numbers()

    def _b64(n: int) -> str:
        return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()

    jwk = {"kty": "EC", "crv": "P-256", "x": _b64(pub.x), "y": _b64(pub.y)}
    return private_key, jwk


def _make_camera(key_id: str, public_jwk: dict) -> MagicMock:
    """Build a camera stub with the given credential fields."""
    camera = MagicMock()
    camera.id = uuid4()
    camera.relay_key_id = key_id
    camera.relay_public_key_jwk = public_jwk
    camera.credential_is_active = True
    return camera


def _make_assertion(
    private_key: ec.EllipticCurvePrivateKey,
    camera_id: str,
    key_id: str,
    *,
    aud: str = _AUD,
    exp_offset: int = 120,
    jti: str | None = None,
) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": f"camera:{camera_id}",
            "sub": f"camera:{camera_id}",
            "aud": aud,
            "iat": now,
            "nbf": now,
            "exp": now + exp_offset,
            "jti": jti or secrets.token_urlsafe(24),
        },
        private_key,
        algorithm=_ALG,
        headers={"kid": key_id},
    )


class TestVerifyDeviceAssertion:
    """Tests for _verify_device_assertion — all accept/reject cases."""

    async def test_accepts_valid_assertion(self) -> None:
        """A well-formed signed assertion should be accepted."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=True)  # nx=True → not a replay

        assertion = _make_assertion(private_key, str(camera.id), key_id)
        payload = await _verify_device_assertion(assertion, camera, redis)

        assert payload["sub"] == f"camera:{camera.id}"
        assert payload["kid"] == key_id

    async def test_rejects_expired_assertion(self) -> None:
        """An assertion with exp in the past should be rejected."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()

        assertion = _make_assertion(private_key, str(camera.id), key_id, exp_offset=-10)
        with pytest.raises(jwt.InvalidTokenError):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_wrong_audience(self) -> None:
        """An assertion with the wrong audience should be rejected."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()

        assertion = _make_assertion(private_key, str(camera.id), key_id, aud="wrong-audience")
        with pytest.raises(jwt.InvalidTokenError):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_wrong_subject(self) -> None:
        """An assertion whose sub doesn't match the camera id should be rejected."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=True)

        # Sign with a different camera id in the subject
        other_id = uuid4()
        assertion = _make_assertion(private_key, str(other_id), key_id)
        with pytest.raises(jwt.InvalidTokenError, match="subject"):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_wrong_kid(self) -> None:
        """An assertion whose kid doesn't match the stored key_id should be rejected."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()

        # Sign with a different kid
        assertion = _make_assertion(private_key, str(camera.id), "wrong-kid")
        with pytest.raises(jwt.InvalidTokenError, match="key id"):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_invalid_signature(self) -> None:
        """An assertion signed by a different key should be rejected."""
        key_id = "key-1"
        _private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()

        # Sign with a completely different private key — won't match the stored public jwk
        wrong_key, _ = _make_key()
        assertion = _make_assertion(wrong_key, str(camera.id), key_id)
        with pytest.raises(jwt.InvalidTokenError):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_replayed_jti(self) -> None:
        """A replayed jti (Redis already has it) should be rejected."""
        key_id = "key-1"
        private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=None)  # nx=True but key exists → None

        assertion = _make_assertion(private_key, str(camera.id), key_id)
        with pytest.raises(jwt.InvalidTokenError, match="replay"):
            await _verify_device_assertion(assertion, camera, redis)

    async def test_rejects_unsupported_algorithm(self) -> None:
        """An assertion signed with HS256 instead of ES256 should be rejected."""
        key_id = "key-1"
        _private_key, jwk = _make_key()
        camera = _make_camera(key_id, jwk)
        redis = AsyncMock()

        now = int(time.time())
        hs256_assertion = jwt.encode(
            {
                "sub": f"camera:{camera.id}",
                "aud": _AUD,
                "iat": now,
                "nbf": now,
                "exp": now + 120,
                "jti": secrets.token_urlsafe(24),
            },
            "some-random-thirty-two-bit-hmac-secret",
            algorithm="HS256",
            headers={"kid": key_id},
        )
        with pytest.raises(jwt.InvalidTokenError, match="algorithm"):
            await _verify_device_assertion(hs256_assertion, camera, redis)
