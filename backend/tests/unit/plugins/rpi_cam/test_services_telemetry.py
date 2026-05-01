"""Unit tests for the backend telemetry cache helpers + schema contract."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock
from uuid import uuid4

from relab_rpi_cam_models.telemetry import TelemetrySnapshot, ThermalState

from app.api.plugins.rpi_cam.runtime_status import (
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


class TestTelemetryCacheKeys:
    """The Redis key namespace for telemetry should be stable across releases."""

    def test_key_includes_the_camera_id(self) -> None:
        """Ensure the cache key includes the camera ID."""
        camera_id = uuid4()
        key = get_telemetry_cache_key(camera_id)
        assert key == f"{TELEMETRY_CACHE_PREFIX}:{camera_id}"

    def test_prefix_and_ttl_are_what_the_router_expects(self) -> None:
        """Ensure the prefix and TTL match the router's expectations."""
        # The router tests rely on these values; pin them so accidental drift fails here first.
        assert TELEMETRY_CACHE_PREFIX == "rpi_cam:telemetry"
        assert TELEMETRY_CACHE_TTL_SECONDS == 120


class TestStoreTelemetry:
    """Storing a snapshot writes the JSON blob with the expected TTL."""

    async def test_store_telemetry_writes_with_ttl(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Ensure telemetry is stored with the correct TTL."""
        redis = AsyncMock()
        set_mock = AsyncMock(return_value=True)
        monkeypatch.setattr(
            "app.api.plugins.rpi_cam.runtime_status.set_redis_value",
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


class TestGetCachedTelemetry:
    """Loading from the cache handles hit / miss / malformed blobs gracefully."""

    async def test_none_redis_returns_none(self) -> None:
        """Ensure None Redis is handled gracefully."""
        result = await get_cached_telemetry(None, uuid4())
        assert result is None

    async def test_cache_hit_parses_json(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Ensure cache hits are parsed correctly."""
        snapshot = _snapshot()
        monkeypatch.setattr(
            "app.api.plugins.rpi_cam.runtime_status.get_redis_value",
            AsyncMock(return_value=snapshot.model_dump_json()),
        )

        result = await get_cached_telemetry(AsyncMock(), uuid4())
        assert result == snapshot

    async def test_cache_miss_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Ensure cache misses are handled gracefully."""
        monkeypatch.setattr(
            "app.api.plugins.rpi_cam.runtime_status.get_redis_value",
            AsyncMock(return_value=None),
        )
        result = await get_cached_telemetry(AsyncMock(), uuid4())
        assert result is None

    async def test_malformed_payload_returns_none_and_logs(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Ensure malformed payloads are handled gracefully."""
        monkeypatch.setattr(
            "app.api.plugins.rpi_cam.runtime_status.get_redis_value",
            AsyncMock(return_value='{"not": "a snapshot"}'),
        )

        with caplog.at_level("WARNING"):
            result = await get_cached_telemetry(AsyncMock(), uuid4())

        assert result is None
        assert "malformed cached telemetry" in caplog.text


class TestTelemetrySchemaContract:
    """Pin the shared-package ``TelemetrySnapshot`` shape so Pi-side changes fail here first."""

    def test_required_fields_are_stable(self) -> None:
        """The Pi emits these fields on every snapshot; relaxing any of them is a contract break."""
        schema = TelemetrySnapshot.model_json_schema()
        assert set(schema["required"]) == {
            "timestamp",
            "cpu_percent",
            "mem_percent",
            "disk_percent",
            "thermal_state",
        }

    def test_thermal_state_enum_values_are_stable(self) -> None:
        """Thermal bands are load-bearing for the governor; changes require coordinated deploys."""
        assert {state.value for state in ThermalState} == {"normal", "warm", "throttle", "critical"}
