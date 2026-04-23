"""Unit tests for the RPi Cam telemetry forwarding router."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import Response
from relab_rpi_cam_models.telemetry import TelemetrySnapshot, ThermalState

from app.api.auth.models import User
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction.telemetry import get_camera_telemetry
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from uuid import UUID

TEST_EMAIL = "test@example.com"
TEST_HASHED_PASSWORD = "hashed_password"
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "A test camera"
HTTP_OK = 200


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value


def _make_snapshot(cpu_temp_c: float | None = 55.5, cpu_percent: float = 12.0) -> TelemetrySnapshot:
    return TelemetrySnapshot(
        timestamp=datetime(2026, 4, 14, 12, 0, 0, tzinfo=UTC),
        cpu_temp_c=cpu_temp_c,
        cpu_percent=cpu_percent,
        mem_percent=40.0,
        disk_percent=25.0,
        preview_fps=None,
        preview_sessions=1,
        thermal_state=ThermalState.NORMAL,
        current_preview_size=None,
    )


def _snapshot_to_json_payload(snapshot: TelemetrySnapshot) -> dict[str, object]:
    return snapshot.model_dump(mode="json")


@pytest.fixture
def mock_user() -> User:
    """Return a mock user for testing."""
    user = UserFactory.build(
        id=uuid4(),
        email=TEST_EMAIL,
        is_active=True,
        is_verified=True,
        hashed_password=TEST_HASHED_PASSWORD,
    )
    assert user.id is not None
    return user


@pytest.fixture
def mock_camera(mock_user: User) -> Camera:
    """Return a mock camera for testing."""
    owner_id = require_uuid(mock_user.id)
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        relay_public_key_jwk={"kty": "EC", "crv": "P-256", "x": "x", "y": "y"},
        relay_key_id="test-key-id",
        owner_id=owner_id,
    )


class TestTelemetryRouter:
    """Cache-first forwarding behaviour for the mosaic telemetry path."""

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.store_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_cached_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.build_camera_request")
    async def test_cache_hit_skips_relay(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_get_cached: MagicMock,
        mock_store: MagicMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """On cache hit the handler returns the cached snapshot and never touches the relay."""
        cached = _make_snapshot()
        mock_get_cached.return_value = cached

        result = await get_camera_telemetry(
            require_uuid(mock_camera.id),
            AsyncMock(),
            mock_user,
            redis=MagicMock(),
            force_refresh=False,
        )

        assert result is cached
        mock_get_cam.assert_not_called()
        mock_build_camera_request.assert_not_called()
        mock_store.assert_not_called()

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.store_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_cached_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.build_camera_request")
    async def test_cache_miss_forwards_and_stores(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_get_cached: MagicMock,
        mock_store: AsyncMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """Cache miss forwards to the Pi, parses the response, and caches it."""
        mock_get_cached.return_value = None
        mock_get_cam.return_value = mock_camera
        mock_store.return_value = None

        fresh = _make_snapshot(cpu_temp_c=68.0)
        mock_camera_request = AsyncMock(return_value=Response(HTTP_OK, json=_snapshot_to_json_payload(fresh)))
        mock_build_camera_request.return_value = mock_camera_request

        redis = MagicMock()
        result = await get_camera_telemetry(
            require_uuid(mock_camera.id),
            AsyncMock(),
            mock_user,
            redis=redis,
            force_refresh=False,
        )

        assert result.cpu_temp_c == 68.0
        assert result.thermal_state == ThermalState.NORMAL
        mock_camera_request.assert_awaited_once()
        assert mock_camera_request.await_args is not None
        kwargs = mock_camera_request.await_args.kwargs
        assert kwargs["endpoint"] == "/system/telemetry"
        assert kwargs["method"] == HttpMethod.GET
        mock_store.assert_awaited_once()
        assert mock_store.await_args is not None
        stored_args = mock_store.await_args.args
        assert stored_args[0] is redis
        assert stored_args[1] == require_uuid(mock_camera.id)
        assert isinstance(stored_args[2], TelemetrySnapshot)

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.store_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_cached_telemetry")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.telemetry.build_camera_request")
    async def test_force_refresh_bypasses_cache(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_get_cached: MagicMock,
        mock_store: AsyncMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """``force_refresh=True`` skips the cache read and re-fetches from the Pi."""
        mock_get_cam.return_value = mock_camera
        fresh = _make_snapshot()
        mock_camera_request = AsyncMock(return_value=Response(HTTP_OK, json=_snapshot_to_json_payload(fresh)))
        mock_build_camera_request.return_value = mock_camera_request

        await get_camera_telemetry(
            require_uuid(mock_camera.id),
            AsyncMock(),
            mock_user,
            redis=MagicMock(),
            force_refresh=True,
        )

        mock_get_cached.assert_not_called()
        mock_camera_request.assert_awaited_once()
        mock_store.assert_not_called()
