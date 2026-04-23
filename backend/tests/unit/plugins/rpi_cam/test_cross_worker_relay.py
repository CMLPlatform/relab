"""Unit tests for the cross-worker relay Redis bridge.

The relay serialises relay commands between Uvicorn workers via Redis lists.
These tests exercise the serialization, deadline, timeout, and binary-payload
contract without standing up a real Redis (a mock Redis is sufficient to
validate the module's own logic — the Redis driver itself is not under test).
"""
# spell-checker: ignore blpop, rpush

# ruff: noqa: SLF001 — private helpers (_resp_ttl_seconds, _execute_and_respond, …) are the subject under test

from __future__ import annotations

import asyncio
import base64
import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.plugins.rpi_cam.websocket import cross_worker_relay as cwr


@pytest.fixture(autouse=True)
def _clear_blocking_redis() -> None:
    """Reset the module-level blocking-Redis singleton between tests."""
    cwr.set_blocking_redis(None)


def _mock_redis() -> MagicMock:
    redis = MagicMock()
    redis.rpush = AsyncMock(return_value=1)
    redis.ltrim = AsyncMock(return_value=True)
    redis.expire = AsyncMock(return_value=True)
    redis.blpop = AsyncMock()
    return redis


# ── Helpers ──────────────────────────────────────────────────────────────────


class TestRespTtl:
    """Cover the response-key TTL bounds helper."""

    def test_floor(self) -> None:
        """Below-floor timeouts use the configured minimum TTL."""
        assert cwr._resp_ttl_seconds(1.0) == cwr._RESP_TTL_MIN_SECONDS

    def test_above_floor_uses_timeout_plus_margin(self) -> None:
        """Above the floor, TTL follows the request timeout plus a small margin."""
        assert cwr._resp_ttl_seconds(200) == 210


class TestBlockingRedisSingleton:
    """Cover the blocking-Redis singleton registration."""

    def test_round_trip(self) -> None:
        """set_blocking_redis / get_blocking_redis round-trip the registered client."""
        assert cwr.get_blocking_redis() is None
        sentinel = MagicMock(name="redis")
        cwr.set_blocking_redis(sentinel)
        assert cwr.get_blocking_redis() is sentinel


# ── relay_cross_worker ───────────────────────────────────────────────────────


class TestRelayCrossWorker:
    """Cover the requesting-worker side of the relay: command push + response wait."""

    async def test_happy_path_roundtrip(self) -> None:
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

    async def test_command_payload_shape(self) -> None:
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

    async def test_timeout_raises_runtime_error(self) -> None:
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

    async def test_blpop_none_raises(self) -> None:
        """A None result from BLPOP is treated as a timeout."""
        redis = _mock_redis()
        redis.blpop.return_value = None
        with pytest.raises(RuntimeError, match="timed out"):
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

    async def test_malformed_response_raises(self) -> None:
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

    async def test_error_field_propagates(self) -> None:
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

    async def test_bad_base64_raises(self) -> None:
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


class TestExecuteAndRespond:
    """Cover the camera-owning-worker side: execute one relayed command and push the result."""

    async def test_success_pushes_response_and_expire(self) -> None:
        """On success the JSON response and any binary payload are pushed to the per-msg response list."""
        redis = _mock_redis()
        manager = MagicMock()
        binary = b"payload"
        manager.send_command = AsyncMock(return_value=({"status": 200, "data": {"k": 1}}, binary))
        cmd = {"msg_id": "m1", "method": "GET", "path": "/p", "timeout_s": 30}

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

    async def test_camera_disconnected_writes_error(self) -> None:
        """RuntimeError from send_command (camera gone) is serialised as an ``error`` payload."""
        redis = _mock_redis()
        manager = MagicMock()
        manager.send_command = AsyncMock(side_effect=RuntimeError("socket closed"))
        cmd = {"msg_id": "m2", "method": "GET", "path": "/p", "timeout_s": 5}

        await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m2")

        raw = redis.rpush.await_args.args[1]
        assert json.loads(raw) == {"error": "socket closed"}

    async def test_unexpected_exception_writes_internal_error(self) -> None:
        """Non-RuntimeError failures are wrapped as ``Internal relay error`` so callers still unblock."""
        redis = _mock_redis()
        manager = MagicMock()
        manager.send_command = AsyncMock(side_effect=ValueError("boom"))
        cmd = {"msg_id": "m3", "method": "GET", "path": "/p", "timeout_s": 5}

        await cwr._execute_and_respond(redis, uuid4(), manager, cmd, "m3")

        raw = redis.rpush.await_args.args[1]
        assert json.loads(raw) == {"error": "Internal relay error: boom"}


# ── run_relay_listener ───────────────────────────────────────────────────────


class TestRunRelayListener:
    """Cover the listener's pre-processing: filter bad / stale commands before executing them."""

    async def test_skips_expired_command(self) -> None:
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

    async def test_skips_malformed_json(self) -> None:
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

    async def test_skips_missing_msg_id(self) -> None:
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

    async def test_dispatches_valid_command(self) -> None:
        """A well-formed command with a future deadline should be dispatched to the manager."""
        redis = _mock_redis()
        manager = MagicMock()
        manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))

        cmd = {
            "msg_id": "m1",
            "method": "GET",
            "path": "/hls",
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
        assert any(call.args[0] == "rpi_cam:relay_resp:m1" for call in redis.rpush.await_args_list)
