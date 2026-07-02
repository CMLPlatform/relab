"""Unit tests for the backend telemetry cache helpers + schema contract."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock
from uuid import uuid4

from relab_rpi_cam_models.telemetry import TelemetrySnapshot, ThermalState

from app.api.plugins.rpi_cam.runtime.status import (
    TELEMETRY_CACHE_PREFIX,
    TELEMETRY_CACHE_TTL_SECONDS,
    get_cached_telemetry,
    get_telemetry_cache_key,
    store_telemetry,
)

if TYPE_CHECKING:
    import pytest


def _snapshot() -> TelemetrySnapshot:
    """Return a sample telemetry snapshot."""
    return TelemetrySnapshot(
        timestamp=datetime(2026, 4, 14, 12, 0, 0, tzinfo=UTC),
        cpu_temp_c=55.5,
        cpu_percent=12.0,
        mem_percent=40.0,
        disk_percent=25.0,
        preview_fps=None,
        preview_sessions=1,
        thermal_state=ThermalState.WARM,
        current_preview_size=None,
    )


def test_key_includes_the_camera_id() -> None:
    """Ensure the cache key includes the camera ID."""
    camera_id = uuid4()
    key = get_telemetry_cache_key(camera_id)
    assert key == f"{TELEMETRY_CACHE_PREFIX}:{camera_id}"


async def test_store_telemetry_writes_with_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure telemetry is stored with the correct TTL."""
    redis = AsyncMock()
    set_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.runtime.status.set_redis_value",
        set_mock,
    )

    snapshot = _snapshot()
    camera_id = uuid4()
    await store_telemetry(redis, camera_id, snapshot)

    set_mock.assert_awaited_once()
    assert set_mock.await_args is not None
    args, kwargs = set_mock.await_args
    assert args[0] is redis
    assert args[1] == get_telemetry_cache_key(camera_id)
    # The payload must round-trip back to the exact same snapshot.
    assert TelemetrySnapshot.model_validate_json(args[2]) == snapshot
    assert kwargs == {"ex": TELEMETRY_CACHE_TTL_SECONDS}


async def test_cache_hit_parses_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure cache hits are parsed correctly."""
    snapshot = _snapshot()
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.runtime.status.get_redis_value",
        AsyncMock(return_value=snapshot.model_dump_json()),
    )

    result = await get_cached_telemetry(AsyncMock(), uuid4())
    assert result == snapshot


async def test_cache_miss_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure cache misses are handled gracefully."""
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.runtime.status.get_redis_value",
        AsyncMock(return_value=None),
    )
    result = await get_cached_telemetry(AsyncMock(), uuid4())
    assert result is None


async def test_malformed_payload_returns_none_and_logs(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Ensure malformed payloads are handled gracefully."""
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.runtime.status.get_redis_value",
        AsyncMock(return_value='{"not": "a snapshot"}'),
    )

    with caplog.at_level("WARNING"):
        result = await get_cached_telemetry(AsyncMock(), uuid4())

    assert result is None
    assert "malformed cached telemetry" in caplog.text
