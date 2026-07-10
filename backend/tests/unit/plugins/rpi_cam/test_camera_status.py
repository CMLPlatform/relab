"""Unit tests for RPi camera online-status TTL handling."""

from app.api.plugins.rpi_cam.runtime import status as status_mod
from app.api.plugins.rpi_cam.websocket.router import _HEARTBEAT_INTERVAL


def test_online_ttl_outlives_two_heartbeat_intervals() -> None:
    """The online-key TTL must comfortably outlive the heartbeat ping cadence.

    A TTL equal to (or less than) the heartbeat interval expires before the
    next pong refreshes it, so a healthy camera would flap to OFFLINE every
    cycle.
    """
    assert status_mod.ONLINE_STATUS_TTL_SECONDS >= 2 * _HEARTBEAT_INTERVAL
