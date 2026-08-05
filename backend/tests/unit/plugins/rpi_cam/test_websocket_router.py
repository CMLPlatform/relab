"""Unit tests for the RPi camera WebSocket router."""

import asyncio
import base64
import secrets
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.api.common.rate_limiting import RateLimitExceededError, rate_limit_bucket_key
from app.api.plugins.rpi_cam.device_assertion import (
    MAX_ASSERTION_TTL_SECONDS,
)
from app.api.plugins.rpi_cam.device_assertion import (
    verify_device_assertion as _verify_device_assertion,
)
from app.api.plugins.rpi_cam.websocket.router import (
    _authenticate,
    _heartbeat_loop,
    _receive_loop,
    _RelayWebSocketSession,
    camera_websocket_connect,
)


async def test_connect_rejects_browser_origin_before_auth_lookup() -> None:
    """The device-only relay should reject browser-origin WebSocket handshakes."""
    websocket = MagicMock()
    websocket.headers = {"origin": "https://evil.example"}
    websocket.client = SimpleNamespace(host="203.0.113.10")
    websocket.close = AsyncMock()
    websocket.accept = AsyncMock()
    camera_id = uuid4()

    with patch("app.api.plugins.rpi_cam.websocket.router._authenticate", new=AsyncMock()) as authenticate:
        await camera_websocket_connect(websocket, camera_id)

    websocket.close.assert_awaited_once_with(
        code=1008,
        reason="Browser-origin WebSocket clients are not allowed.",
    )
    websocket.accept.assert_not_awaited()
    authenticate.assert_not_awaited()


async def test_connect_logs_unexpected_background_task_failure() -> None:
    """A background task (relay listener/heartbeat) that fails unexpectedly must be logged.

    ``asyncio.gather(..., return_exceptions=True)`` swallows exceptions unless the
    caller inspects the results; a silent failure here would hide a broken relay
    listener until someone noticed cameras stopped responding.
    """
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10")
    websocket.accept = AsyncMock()
    camera_id = uuid4()

    manager = MagicMock()
    manager.register = AsyncMock()
    manager.unregister = MagicMock(return_value=False)
    redis = AsyncMock()

    async def _failing_relay_listener(*_args: object, **_kwargs: object) -> None:
        msg = "boom"
        raise ValueError(msg)

    async def _hang_forever(*_args: object, **_kwargs: object) -> None:
        await asyncio.Event().wait()

    async def _noop_receive_loop(*_args: object, **_kwargs: object) -> None:
        # Yield control so the scheduled relay-listener/heartbeat tasks actually get
        # to run (and the fake listener gets to raise) before this returns and the
        # cleanup path cancels them.
        await asyncio.sleep(0)

    with (
        patch("app.api.plugins.rpi_cam.websocket.router._authenticate", new=AsyncMock(return_value=True)),
        patch("app.api.plugins.rpi_cam.websocket.router.get_connection_manager", return_value=manager),
        patch("app.api.plugins.rpi_cam.websocket.router.require_connection_redis", return_value=redis),
        patch("app.api.plugins.rpi_cam.websocket.router._receive_loop", new=_noop_receive_loop),
        patch("app.api.plugins.rpi_cam.websocket.router.run_relay_listener", new=_failing_relay_listener),
        patch("app.api.plugins.rpi_cam.websocket.router._heartbeat_loop", new=_hang_forever),
        patch("app.api.plugins.rpi_cam.websocket.router.mark_camera_offline", new=AsyncMock()),
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        await camera_websocket_connect(websocket, camera_id)

    logged_unexpected = [
        call
        for call in mock_logger.exception.call_args_list
        if call.kwargs.get("exc_info") is not None and isinstance(call.kwargs["exc_info"], ValueError)
    ]
    assert len(logged_unexpected) == 1
    assert str(camera_id) in logged_unexpected[0].args


async def test_session_text_frame_sanitizes_camera_id_in_log() -> None:
    """Invalid JSON logging should neutralize line breaks in camera IDs."""
    camera_id = uuid4()
    manager = MagicMock(spec=[])
    session = _RelayWebSocketSession(camera_id=camera_id, manager=manager, redis=AsyncMock(), last_pong_at=0.0)

    with patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger:
        await session.handle_text_frame("{not-json")

    assert not session.pending_binary_responses
    assert session.last_pong_at == 0.0
    mock_logger.warning.assert_called_once_with("Camera %s sent invalid JSON, ignoring.", str(camera_id))


async def test_session_text_frame_ignores_malformed_response_envelope() -> None:
    """Malformed response envelopes should not tear down the receive loop."""
    camera_id = uuid4()
    manager = MagicMock()
    session = _RelayWebSocketSession(camera_id=camera_id, manager=manager, redis=AsyncMock(), last_pong_at=0.0)

    with patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger:
        await session.handle_text_frame('{"type":"response","id":"msg-1","status":"not-an-int"}')

    assert not session.pending_binary_responses
    assert session.last_pong_at == 0.0
    manager.resolve_json.assert_not_called()
    mock_logger.warning.assert_called_once_with(
        "Camera %s sent malformed response envelope, ignoring.",
        str(camera_id),
    )


async def test_session_text_frame_ignores_non_object_json() -> None:
    """Valid JSON text frames that are not objects should be ignored."""
    camera_id = uuid4()
    manager = MagicMock()
    session = _RelayWebSocketSession(camera_id=camera_id, manager=manager, redis=AsyncMock(), last_pong_at=0.0)

    await session.handle_text_frame('["response"]')

    assert not session.pending_binary_responses
    assert session.last_pong_at == 0.0
    manager.resolve_json.assert_not_called()


async def test_authenticate_sanitizes_client_ip_when_blocked() -> None:
    """Blocked auth logging should use the safe IP bucket rather than the raw IP."""
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10\nFORGED")
    websocket.close = AsyncMock()
    camera_id = uuid4()

    with (
        patch("app.api.plugins.rpi_cam.websocket.router.limiter") as mock_limiter,
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        mock_limiter.ahit_key = AsyncMock(side_effect=RateLimitExceededError)
        result = await _authenticate(websocket, camera_id)

    assert result is False
    websocket.close.assert_awaited_once()
    mock_logger.warning.assert_called_once_with(
        "WebSocket auth bucket %s for camera %s blocked by rate limit.",
        rate_limit_bucket_key("rpi-cam:ws-auth:ip", "203.0.113.10\nFORGED"),
        str(camera_id),
    )
    assert "203.0.113.10" not in str(mock_logger.warning.call_args)


async def test_authenticate_enforces_redis_backed_rate_limit_before_auth_lookup() -> None:
    """WebSocket auth attempts should use the shared limiter so limits work across workers."""
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10")
    websocket.close = AsyncMock()
    camera_id = uuid4()

    with patch("app.api.plugins.rpi_cam.websocket.router.limiter", create=True) as mock_limiter:
        mock_limiter.ahit_key = AsyncMock()
        result = await _authenticate(websocket, camera_id)

    assert result is False
    mock_limiter.ahit_key.assert_any_await(
        "10/minute",
        rate_limit_bucket_key("rpi-cam:ws-auth:ip", "203.0.113.10"),
    )
    mock_limiter.ahit_key.assert_any_await(
        "10/minute",
        rate_limit_bucket_key("rpi-cam:ws-auth:camera", str(camera_id)),
    )


async def test_heartbeat_loop_sanitizes_camera_id_on_timeout() -> None:
    """Heartbeat timeout logging should neutralize line breaks in camera IDs."""
    websocket = MagicMock()
    websocket.close = AsyncMock()
    websocket.send_text = AsyncMock()
    camera_id = uuid4()
    session = _RelayWebSocketSession(camera_id=camera_id, manager=MagicMock(), redis=AsyncMock(), last_pong_at=0.0)

    with (
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.sleep", new=AsyncMock()),
        patch("app.api.plugins.rpi_cam.websocket.router.monotonic", return_value=91.0),
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        await _heartbeat_loop(websocket, session)

    websocket.close.assert_awaited_once_with(code=1001)
    mock_logger.warning.assert_called_once_with(
        "Camera %s heartbeat timeout (%.0fs since last pong); closing.",
        str(camera_id),
        91.0,
    )


async def test_receive_loop_closes_on_oversized_text_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    """Oversized WebSocket text frames should close before JSON parsing or dispatch."""
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.websocket.router.RELAY_WS_TEXT_FRAME_LIMIT_BYTES",
        8,
    )
    websocket = AsyncMock()
    websocket.receive = AsyncMock(
        side_effect=[
            {"type": "websocket.receive", "text": "x" * 9},
            {"type": "websocket.disconnect"},
        ]
    )
    websocket.close = AsyncMock()

    await _receive_loop(websocket, _RelayWebSocketSession(camera_id=uuid4(), manager=MagicMock(), redis=AsyncMock()))

    websocket.close.assert_awaited_once()


async def test_receive_loop_accepts_binary_frames_within_the_limit() -> None:
    """A binary frame under the app-level cap is passed through, not closed."""
    websocket = AsyncMock()
    websocket.receive = AsyncMock(
        side_effect=[
            {"type": "websocket.receive", "bytes": b"x" * 9},
            {"type": "websocket.disconnect"},
        ]
    )
    websocket.close = AsyncMock()

    await _receive_loop(websocket, _RelayWebSocketSession(camera_id=uuid4(), manager=MagicMock(), redis=AsyncMock()))

    websocket.close.assert_not_awaited()


async def test_receive_loop_closes_on_oversized_binary_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    """Oversized binary frames are capped at the app level, mirroring the text-frame limit."""
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.websocket.router.settings.rpi_cam_ws_binary_frame_limit_bytes",
        8,
    )
    websocket = AsyncMock()
    websocket.receive = AsyncMock(
        side_effect=[
            {"type": "websocket.receive", "bytes": b"x" * 9},
            {"type": "websocket.disconnect"},
        ]
    )
    websocket.close = AsyncMock()

    await _receive_loop(websocket, _RelayWebSocketSession(camera_id=uuid4(), manager=MagicMock(), redis=AsyncMock()))

    websocket.close.assert_awaited_once()


async def test_session_updates_last_pong_at_from_pong_frame() -> None:
    """The receive session should own heartbeat timestamp updates."""
    manager = MagicMock()
    session = _RelayWebSocketSession(camera_id=uuid4(), manager=manager, redis=AsyncMock(), last_pong_at=1.0)

    with patch("app.api.plugins.rpi_cam.websocket.router.monotonic", return_value=123.0):
        await session.handle_text_frame('{"type":"pong"}')

    assert session.last_pong_at == 123.0


async def test_session_pairs_binary_frame_with_pending_response() -> None:
    """The receive session should pair a binary frame with its pending JSON response."""
    manager = MagicMock()
    session = _RelayWebSocketSession(camera_id=uuid4(), manager=manager, redis=AsyncMock())
    await session.handle_text_frame('{"type":"response","id":"msg-1","status":200,"has_binary":true}')

    session.handle_binary_frame(b"payload")

    manager.resolve_json.assert_called_once_with(
        session.camera_id,
        "msg-1",
        {
            "id": "msg-1",
            "type": "response",
            "status": 200,
            "content_type": None,
            "has_binary": True,
            "data": None,
        },
        b"payload",
    )
    assert not session.pending_binary_responses


async def test_session_pairs_pipelined_binary_responses_in_order() -> None:
    """Two pipelined binary responses should pair with their headers FIFO."""
    manager = MagicMock()
    session = _RelayWebSocketSession(camera_id=uuid4(), manager=manager, redis=AsyncMock())
    await session.handle_text_frame('{"type":"response","id":"msg-1","status":200,"has_binary":true}')
    await session.handle_text_frame('{"type":"response","id":"msg-2","status":200,"has_binary":true}')
    # A non-binary response in between must not drop the pending binary headers.
    await session.handle_text_frame('{"type":"response","id":"msg-3","status":200}')

    session.handle_binary_frame(b"first")
    session.handle_binary_frame(b"second")

    resolved = [(call.args[1], call.args[3]) for call in manager.resolve_json.call_args_list]
    assert resolved == [("msg-3", None), ("msg-1", b"first"), ("msg-2", b"second")]
    assert not session.pending_binary_responses


async def test_pending_binary_responses_are_bounded() -> None:
    """A device flagging has_binary without sending the frame cannot grow memory unbounded."""
    session = _RelayWebSocketSession(camera_id=uuid4(), manager=MagicMock(), redis=AsyncMock())
    for i in range(500):
        await session.handle_text_frame(f'{{"type":"response","id":"msg-{i}","status":200,"has_binary":true}}')
    assert len(session.pending_binary_responses) == 64


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
    iss: str | None = None,
    sub: str | None = None,
    jti: str | None = None,
    omit_claims: set[str] | None = None,
) -> str:
    now = int(time.time())
    payload = {
        "iss": iss or f"camera:{camera_id}",
        "sub": sub or f"camera:{camera_id}",
        "aud": aud,
        "iat": now,
        "nbf": now,
        "exp": now + exp_offset,
        "jti": jti or secrets.token_urlsafe(24),
    }
    for claim in omit_claims or set():
        payload.pop(claim, None)
    return jwt.encode(
        payload,
        private_key,
        algorithm=_ALG,
        headers={"kid": key_id},
    )


async def test_accepts_valid_assertion() -> None:
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


async def test_rejects_assertion_lifetime_over_cap() -> None:
    """An assertion whose lifetime exceeds the replay-tracking cap is rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    assertion = _make_assertion(private_key, str(camera.id), key_id, exp_offset=MAX_ASSERTION_TTL_SECONDS + 60)
    with pytest.raises(jwt.InvalidTokenError, match="lifetime"):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_expired_assertion() -> None:
    """An assertion with exp in the past should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()

    assertion = _make_assertion(private_key, str(camera.id), key_id, exp_offset=-10)
    with pytest.raises(jwt.InvalidTokenError):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_wrong_audience() -> None:
    """An assertion with the wrong audience should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()

    assertion = _make_assertion(private_key, str(camera.id), key_id, aud="wrong-audience")
    with pytest.raises(jwt.InvalidTokenError):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_wrong_subject() -> None:
    """An assertion whose sub doesn't match the camera id should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    # Sign with a different camera id in the subject
    other_id = uuid4()
    assertion = _make_assertion(private_key, str(camera.id), key_id, sub=f"camera:{other_id}")
    with pytest.raises(jwt.InvalidTokenError, match="subject"):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_missing_issuer() -> None:
    """An assertion without iss should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    assertion = _make_assertion(private_key, str(camera.id), key_id, omit_claims={"iss"})
    with pytest.raises(jwt.InvalidTokenError):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_wrong_issuer() -> None:
    """An assertion whose iss doesn't match the camera id should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    assertion = _make_assertion(private_key, str(camera.id), key_id, iss=f"camera:{uuid4()}")
    with pytest.raises(jwt.InvalidTokenError, match="issuer"):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_wrong_kid() -> None:
    """An assertion whose kid doesn't match the stored key_id should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()

    # Sign with a different kid
    assertion = _make_assertion(private_key, str(camera.id), "wrong-kid")
    with pytest.raises(jwt.InvalidTokenError, match="key id"):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_invalid_signature() -> None:
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


async def test_rejects_replayed_jti() -> None:
    """A replayed jti (Redis already has it) should be rejected."""
    key_id = "key-1"
    private_key, jwk = _make_key()
    camera = _make_camera(key_id, jwk)
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=None)  # nx=True but key exists → None

    assertion = _make_assertion(private_key, str(camera.id), key_id)
    with pytest.raises(jwt.InvalidTokenError, match="replay"):
        await _verify_device_assertion(assertion, camera, redis)


async def test_rejects_unsupported_algorithm() -> None:
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
