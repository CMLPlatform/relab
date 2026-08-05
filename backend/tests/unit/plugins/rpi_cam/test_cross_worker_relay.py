"""Unit tests for the cross-worker relay Redis bridge.

The relay serialises relay commands between Uvicorn workers via Redis lists.
These tests exercise the serialization, deadline, timeout, and binary-payload
contract without standing up a real Redis (a mock Redis is sufficient to
validate the module's own logic — the Redis driver itself is not under test).
"""

import asyncio
import base64
import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.plugins.rpi_cam.websocket import cross_worker_relay as cwr


def _mock_redis() -> MagicMock:
    redis = MagicMock()
    redis.rpush = AsyncMock(return_value=1)
    redis.ltrim = AsyncMock(return_value=True)
    redis.expire = AsyncMock(return_value=True)
    redis.blpop = AsyncMock()
    return redis


# ── Helpers ──────────────────────────────────────────────────────────────────


def test_floor() -> None:
    """Below-floor timeouts use the configured minimum TTL."""
    assert cwr._resp_ttl_seconds(1.0) == cwr._RESP_TTL_MIN_SECONDS


def test_above_floor_uses_timeout_plus_margin() -> None:
    """Above the floor, TTL follows the request timeout plus a small margin."""
    assert cwr._resp_ttl_seconds(200) == 210


async def test_uses_finite_poll_timeout() -> None:
    """The shared Redis client must never use an indefinite BLPOP wait here."""
    redis = _mock_redis()
    redis.blpop.return_value = ("key", "payload")

    result = await cwr._blpop_once(redis, "relay-key")

    assert result == ("key", "payload")
    redis.blpop.assert_awaited_once_with("relay-key", timeout=cwr._BLPOP_POLL_SECONDS)


# ── relay_cross_worker ───────────────────────────────────────────────────────


async def test_happy_path_roundtrip() -> None:
    """A valid response with binary payload round-trips cleanly back to the caller."""
    redis = _mock_redis()
    binary = b"\x00\x01\x02\x03"
    response = {
        "status": 200,
        "data": {"ok": True},
        "binary_b64": base64.b64encode(binary).decode(),
    }
    redis.blpop.return_value = ("key", json.dumps(response))

    json_resp, got_binary = await cwr.relay_cross_worker(
        redis,
        uuid4(),
        "GET",
        "/hls/segment",
        params=None,
        body=None,
        headers=None,
        timeout_s=30,
    )

    assert json_resp == {"status": 200, "data": {"ok": True}}
    assert got_binary == binary
    redis.rpush.assert_awaited_once()
    redis.ltrim.assert_awaited_once()
    assert redis.blpop.await_args.kwargs == {"timeout": cwr._BLPOP_POLL_SECONDS}


async def test_blpop_none_polls_until_response() -> None:
    """Finite BLPOP waits should be retried inside the overall relay timeout."""
    redis = _mock_redis()
    response = {"status": 200, "data": {"ok": True}}
    redis.blpop.side_effect = [None, ("key", json.dumps(response))]

    json_resp, got_binary = await cwr.relay_cross_worker(
        redis,
        uuid4(),
        "GET",
        "/status",
        params=None,
        body=None,
        headers=None,
        timeout_s=30,
    )

    assert json_resp == {"status": 200, "data": {"ok": True}}
    assert got_binary is None
    assert redis.blpop.await_count == 2
    assert all(call.kwargs == {"timeout": cwr._BLPOP_POLL_SECONDS} for call in redis.blpop.await_args_list)


async def test_command_payload_shape() -> None:
    """The pushed command must carry the fields the listener reads."""
    redis = _mock_redis()
    redis.blpop.return_value = ("key", json.dumps({"status": 200, "data": {}}))
    camera_id = uuid4()

    await cwr.relay_cross_worker(
        redis,
        camera_id,
        "POST",
        "/capture",
        params={"q": "1"},
        body={"name": "x"},
        headers={"X-Test": "1"},
        timeout_s=10,
    )

    cmd_key, raw_cmd = redis.rpush.await_args.args
    assert cmd_key == f"rpi_cam:relay_cmd:{camera_id}"
    cmd = json.loads(raw_cmd)
    assert cmd["method"] == "POST"
    assert cmd["path"] == "/capture"
    assert cmd["params"] == {"q": "1"}
    assert cmd["body"] == {"name": "x"}
    assert cmd["headers"] == {"X-Test": "1"}
    assert cmd["timeout_s"] == 10
    assert "msg_id" in cmd
    assert "deadline" in cmd


async def test_timeout_raises_runtime_error() -> None:
    """If BLPOP never returns within the deadline, the caller sees RuntimeError (→ HTTP 503)."""
    redis = _mock_redis()

    async def _hang(*_a: object, **_kw: object) -> None:
        await asyncio.sleep(10)

    redis.blpop.side_effect = _hang

    with pytest.raises(RuntimeError, match="timed out"):
        await cwr.relay_cross_worker(
            redis,
            uuid4(),
            "GET",
            "/x",
            None,
            None,
            None,
            timeout_s=0.05,
        )


async def test_blpop_none_raises() -> None:
    """Repeated finite BLPOP misses are bounded by the overall relay timeout."""
    redis = _mock_redis()

    async def _miss(*_a: object, **_kw: object) -> None:
        await asyncio.sleep(0.001)

    redis.blpop.side_effect = _miss
    with pytest.raises(RuntimeError, match="timed out"):
        await cwr.relay_cross_worker(
            redis,
            uuid4(),
            "GET",
            "/x",
            None,
            None,
            None,
            timeout_s=0.01,
        )


async def test_malformed_response_raises() -> None:
    """Corrupt response JSON on the wire is reported as a relay failure."""
    redis = _mock_redis()
    redis.blpop.return_value = ("key", "{not-json")
    with pytest.raises(RuntimeError, match="malformed response"):
        await cwr.relay_cross_worker(
            redis,
            uuid4(),
            "GET",
            "/x",
            None,
            None,
            None,
            timeout_s=1,
        )


async def test_error_field_propagates() -> None:
    """An ``error`` field in the response surfaces as a RuntimeError carrying the remote message."""
    redis = _mock_redis()
    redis.blpop.return_value = ("key", json.dumps({"error": "camera gone"}))
    with pytest.raises(RuntimeError, match="camera gone"):
        await cwr.relay_cross_worker(
            redis,
            uuid4(),
            "GET",
            "/x",
            None,
            None,
            None,
            timeout_s=1,
        )


async def test_bad_base64_raises() -> None:
    """Binary payloads with invalid base64 are rejected (don't silently corrupt data)."""
    redis = _mock_redis()
    redis.blpop.return_value = (
        "key",
        json.dumps({"status": 200, "data": {}, "binary_b64": "!!!not-base64!!!"}),
    )
    with pytest.raises(RuntimeError, match="binary payload"):
        await cwr.relay_cross_worker(
            redis,
            uuid4(),
            "GET",
            "/x",
            None,
            None,
            None,
            timeout_s=1,
        )


# ── _execute_and_respond ─────────────────────────────────────────────────────


async def test_success_pushes_response_and_expire() -> None:
    """On success the JSON response and any binary payload are pushed to the per-msg response list."""
    redis = _mock_redis()
    manager = MagicMock()
    binary = b"payload"
    manager.send_command = AsyncMock(return_value=({"status": 200, "data": {"k": 1}}, binary))
    cmd = {"msg_id": "m1", "method": "GET", "path": "/camera", "timeout_s": 30}

    await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m1")

    redis.rpush.assert_awaited_once()
    redis.expire.assert_awaited_once()
    resp_key, raw = redis.rpush.await_args.args
    assert resp_key == "rpi_cam:relay_resp:m1"
    assert json.loads(raw) == {
        "status": 200,
        "data": {"k": 1},
        "binary_b64": base64.b64encode(binary).decode(),
    }


async def test_camera_disconnected_writes_error() -> None:
    """RuntimeError from send_command (camera gone) is serialised as an ``error`` payload."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock(side_effect=RuntimeError("socket closed"))
    cmd = {"msg_id": "m2", "method": "GET", "path": "/camera", "timeout_s": 5}

    await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m2")

    raw = redis.rpush.await_args.args[1]
    assert json.loads(raw) == {"error": "socket closed"}


async def test_unexpected_exception_writes_internal_error() -> None:
    """Non-RuntimeError failures are wrapped as ``Internal relay error`` so callers still unblock."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock(side_effect=ValueError("boom"))
    cmd = {"msg_id": "m3", "method": "GET", "path": "/camera", "timeout_s": 5}

    await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m3")

    raw = redis.rpush.await_args.args[1]
    assert json.loads(raw) == {"error": "Internal relay error: boom"}


async def test_unresponsive_camera_times_out_and_writes_error() -> None:
    """A connected-but-silent camera must not hang the listener; send_command is bounded by timeout_s."""
    redis = _mock_redis()
    manager = MagicMock()

    async def _never_responds(*_args: object, **_kwargs: object) -> tuple[dict, bytes | None]:
        await asyncio.Event().wait()  # hangs until cancelled by the timeout
        return {}, None  # unreachable

    manager.send_command = AsyncMock(side_effect=_never_responds)
    cmd = {"msg_id": "m4", "method": "GET", "path": "/camera", "timeout_s": 0.01}

    await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m4")

    raw = redis.rpush.await_args.args[1]
    assert json.loads(raw) == {"error": "Camera did not respond in time."}


async def test_disallowed_command_is_blocked_before_dispatch() -> None:
    """A command whose method/path isn't allowlisted must never reach send_command.

    The requesting worker already checks the allowlist, but this worker (which
    actually forwards to the Pi) must re-check the payload it read from Redis
    rather than trust it blindly.
    """
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock()
    cmd = {"msg_id": "m5", "method": "DELETE", "path": "/camera", "timeout_s": 5}

    await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m5")

    manager.send_command.assert_not_called()
    raw = redis.rpush.await_args.args[1]
    payload = json.loads(raw)
    assert payload.get("status") == 403
    assert "error" in payload


# ── run_relay_listener ───────────────────────────────────────────────────────


async def test_skips_expired_command() -> None:
    """Commands whose deadline is in the past must be dropped before dispatch."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock()

    expired_cmd = {"msg_id": "m", "deadline": 1.0, "method": "GET", "path": "/"}
    responses: list[object] = [("k", json.dumps(expired_cmd))]

    async def _blpop(*_a: object, **_kw: object) -> object:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    redis.blpop.side_effect = _blpop

    await cwr.run_relay_listener(redis, uuid4(), manager)

    manager.send_command.assert_not_called()


async def test_skips_malformed_json() -> None:
    """A malformed JSON command should be caught and skipped, not crash the listener."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock()
    responses: list[object] = [("k", "{not-json")]

    async def _blpop(*_a: object, **_kw: object) -> object:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    redis.blpop.side_effect = _blpop
    await cwr.run_relay_listener(redis, uuid4(), manager)
    manager.send_command.assert_not_called()


async def test_skips_missing_msg_id() -> None:
    """Commands without a msg_id cannot be replied to, so they must be skipped."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock()
    responses: list[object] = [("k", json.dumps({"method": "GET", "path": "/"}))]

    async def _blpop(*_a: object, **_kw: object) -> object:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    redis.blpop.side_effect = _blpop
    await cwr.run_relay_listener(redis, uuid4(), manager)
    manager.send_command.assert_not_called()


async def test_dispatches_valid_command() -> None:
    """A well-formed command with a future deadline should be dispatched to the manager."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))

    cmd = {
        "msg_id": "m1",
        "method": "GET",
        "path": "/preview/hls/segment.ts",
        "params": None,
        "body": None,
        "headers": {},
        "deadline": 0,  # 0 means "no deadline" per module convention
        "timeout_s": 30,
    }
    responses: list[object] = [("k", json.dumps(cmd))]

    async def _blpop(*_a: object, **_kw: object) -> object:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    redis.blpop.side_effect = _blpop
    await cwr.run_relay_listener(redis, uuid4(), manager)

    manager.send_command.assert_awaited_once()
    assert redis.blpop.await_args_list[0].kwargs == {"timeout": cwr._BLPOP_POLL_SECONDS}
    assert any(call.args[0] == "rpi_cam:relay_resp:m1" for call in redis.rpush.await_args_list)


async def test_redis_error_backs_off_and_keeps_listening(monkeypatch: pytest.MonkeyPatch) -> None:
    """A transient Redis failure during BLPOP must not kill the listener task.

    It should log, back off briefly, and keep polling — the next command that
    arrives once Redis recovers must still be processed.
    """
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))
    cmd = {
        "msg_id": "m1",
        "method": "GET",
        "path": "/camera",
        "params": None,
        "body": None,
        "headers": {},
        "deadline": 0,
        "timeout_s": 30,
    }
    responses: list[object] = [("k", json.dumps(cmd))]

    async def _blpop(*_a: object, **_kw: object) -> object:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    call_count = 0

    async def _blpop_with_one_failure(*args: object, **kwargs: object) -> object:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            msg = "redis unreachable"
            raise RedisConnectionError(msg)
        return await _blpop(*args, **kwargs)

    redis.blpop.side_effect = _blpop_with_one_failure

    sleeps: list[float] = []

    async def _fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(cwr.anyio, "sleep", _fake_sleep)

    await cwr.run_relay_listener(redis, uuid4(), manager)

    assert sleeps == [1]
    manager.send_command.assert_awaited_once()


async def test_empty_blpop_result_keeps_polling() -> None:
    """A finite BLPOP timeout should keep the listener alive until a command arrives."""
    redis = _mock_redis()
    manager = MagicMock()
    manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))
    cmd = {
        "msg_id": "m1",
        "method": "GET",
        "path": "/preview/hls/segment.ts",
        "params": None,
        "body": None,
        "headers": {},
        "deadline": 0,
        "timeout_s": 30,
    }
    responses: list[object | None] = [None, ("k", json.dumps(cmd))]

    async def _blpop(*_a: object, **_kw: object) -> object | None:
        if responses:
            return responses.pop(0)
        raise asyncio.CancelledError

    redis.blpop.side_effect = _blpop
    await cwr.run_relay_listener(redis, uuid4(), manager)

    manager.send_command.assert_awaited_once()
    assert redis.blpop.await_count == 3
    assert all(call.kwargs == {"timeout": cwr._BLPOP_POLL_SECONDS} for call in redis.blpop.await_args_list)
