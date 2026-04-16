"""Unit tests for the RPi Cam snapshot forwarding router."""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from httpx import Response

from app.api.auth.models import User
from app.api.plugins.rpi_cam.routers.camera_interaction.snapshot import get_camera_snapshot


class TestSnapshotRouter:
    """Snapshot forwarding should relay one binary frame and return JPEG bytes."""

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.snapshot.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.snapshot.build_camera_request")
    async def test_snapshot_forwards_binary_response(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_camera: MagicMock,
    ) -> None:
        """Snapshot requests should proxy the camera JPEG bytes unchanged."""
        camera = SimpleNamespace(id=uuid4())
        mock_get_camera.return_value = camera
        mock_camera_request = AsyncMock(return_value=Response(200, content=b"\xff\xd8\xff"))
        mock_build_camera_request.return_value = mock_camera_request

        response = await get_camera_snapshot(
            camera.id,
            AsyncMock(),
            cast("User", SimpleNamespace(id=uuid4())),
            redis=AsyncMock(),
        )

        assert response.media_type == "image/jpeg"
        assert response.body[:2] == b"\xff\xd8"
        mock_camera_request.assert_awaited_once()
        assert mock_camera_request.await_args is not None
        kwargs = mock_camera_request.await_args.kwargs
        assert kwargs["endpoint"] == "/preview/snapshot"
        assert kwargs["expect_binary"] is True
