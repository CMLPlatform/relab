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
