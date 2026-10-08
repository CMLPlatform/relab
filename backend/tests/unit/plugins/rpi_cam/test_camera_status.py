"""Unit tests for RPi camera online-status TTL handling."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.plugins.rpi_cam.models import CameraConnectionStatus
from app.api.plugins.rpi_cam.runtime import status as status_mod
from app.api.plugins.rpi_cam.websocket.router import _HEARTBEAT_INTERVAL


async def test_get_camera_status_degrades_to_offline_on_redis_error() -> None:
    """A Redis outage while reading status must report OFFLINE, not raise 500."""
    redis_client = MagicMock()
    pipeline = MagicMock()
    pipeline.get = MagicMock()
    pipeline.execute = AsyncMock(side_effect=RedisConnectionError("redis unreachable"))
    redis_client.pipeline = MagicMock(return_value=pipeline)

    result = await status_mod.get_camera_status(redis_client, uuid4())

    assert result.connection == CameraConnectionStatus.OFFLINE
    assert result.last_seen_at is None


def test_online_ttl_outlives_two_heartbeat_intervals() -> None:
    """The online-key TTL must comfortably outlive the heartbeat ping cadence.

    A TTL equal to (or less than) the heartbeat interval expires before the
    next pong refreshes it, so a healthy camera would flap to OFFLINE every
    cycle.
    """
    assert status_mod.ONLINE_STATUS_TTL_SECONDS >= 2 * _HEARTBEAT_INTERVAL


async def test_last_seen_key_expires() -> None:
    """The last-seen key carries a TTL, so a deleted camera's key does not outlive it forever.

    A camera still connected when it is deleted keeps heartbeating until its socket
    closes, so deleting the key alongside the row could be undone by the next pong.
    """
    redis_client = MagicMock()
    redis_client.set = AsyncMock(return_value=True)
    camera_id = uuid4()

    await status_mod.mark_camera_online(redis_client, camera_id)

    last_seen_key = status_mod.get_camera_last_seen_cache_key(camera_id)
    [last_seen_call] = [c for c in redis_client.set.await_args_list if c.args[0] == last_seen_key]
    assert last_seen_call.kwargs["ex"] == status_mod.LAST_SEEN_TTL_SECONDS


async def test_camera_statuses_use_one_redis_round_trip_regardless_of_camera_count() -> None:
    """Listing cameras with telemetry costs one pipeline execute, not two per camera."""
    redis_client = MagicMock()
    pipeline = MagicMock()
    queued: list[str] = []
    pipeline.get = MagicMock(side_effect=queued.append)
    pipeline.execute = AsyncMock(side_effect=lambda: [None] * len(queued))
    redis_client.pipeline = MagicMock(return_value=pipeline)
    redis_client.get = AsyncMock(return_value=None)

    for count in (2, 20):
        queued.clear()
        pipeline.execute.reset_mock()
        camera_ids = [uuid4() for _ in range(count)]

        result = await status_mod.get_camera_statuses(redis_client, camera_ids, include_telemetry=True)

        assert pipeline.execute.await_count == 1
        assert len(queued) == 3 * count
        redis_client.get.assert_not_awaited()
        assert set(result) == set(camera_ids)
        assert all(s.connection == CameraConnectionStatus.OFFLINE and t is None for s, t in result.values())
