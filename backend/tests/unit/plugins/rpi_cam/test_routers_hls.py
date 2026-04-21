"""Unit tests for the RPi Cam LL-HLS proxy router."""
# spell-checker: ignore ftypmp, EXTM, mpegurl
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.auth.models import User
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction import hls as hls_mod
from app.api.plugins.rpi_cam.routers.camera_interaction.hls import proxy_hls
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from uuid import UUID

TEST_EMAIL = "test@example.com"
TEST_HASHED_PASSWORD = "hashed_password"
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "A test camera"


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value


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


class TestProxyHls:
    """HLS proxy forwards the path verbatim through the relay and returns bytes."""

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_playlist_request_forwarded_and_returned_as_hls_text(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """``.m3u8`` requests come back with the HLS manifest content type."""
        mock_get_cam.return_value = mock_camera
        playlist = b"#EXTM3U\n#EXT-X-VERSION:9\n"
        mock_camera_request = AsyncMock(return_value=RelayResponse(status_code=200, _content=playlist))
        mock_build_camera_request.return_value = mock_camera_request

        result = await proxy_hls(
            require_uuid(mock_camera.id),
            "cam-preview/index.m3u8",
            AsyncMock(),
            mock_user,
            AsyncMock(),
        )

        assert result.body == playlist
        assert result.media_type == "application/vnd.apple.mpegurl"
        mock_camera_request.assert_awaited_once()
        assert mock_camera_request.await_args is not None
        kwargs = mock_camera_request.await_args.kwargs
        assert kwargs["endpoint"] == "/preview/hls/cam-preview/index.m3u8"
        assert kwargs["method"] == HttpMethod.GET
        assert kwargs["expect_binary"] is True

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_segment_request_returns_video_mp4(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """``.mp4`` segments come back with ``video/mp4`` content-type."""
        mock_get_cam.return_value = mock_camera
        segment = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00"
        mock_camera_request = AsyncMock(return_value=RelayResponse(status_code=200, _content=segment))
        mock_build_camera_request.return_value = mock_camera_request

        result = await proxy_hls(
            require_uuid(mock_camera.id),
            "cam-preview/segment0.mp4",
            AsyncMock(),
            mock_user,
            AsyncMock(),
        )

        assert result.body == segment
        assert result.media_type == "video/mp4"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_unknown_extension_falls_back_to_octet_stream(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """Unknown file extensions get a generic binary content type."""
        mock_get_cam.return_value = mock_camera
        mock_camera_request = AsyncMock(return_value=RelayResponse(status_code=200, _content=b"raw"))
        mock_build_camera_request.return_value = mock_camera_request

        result = await proxy_hls(
            require_uuid(mock_camera.id),
            "cam-preview/part0.m4s",
            AsyncMock(),
            mock_user,
            AsyncMock(),
        )

        assert result.media_type == "application/octet-stream"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_manifest_retries_404_with_exponential_backoff(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_sleep: AsyncMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """Manifest 404s should retry with the configured exponential schedule."""
        mock_get_cam.return_value = mock_camera
        playlist = b"#EXTM3U\n"
        mock_camera_request = AsyncMock(
            side_effect=[
                HTTPException(status_code=404, detail="not ready"),
                HTTPException(status_code=404, detail="still warming"),
                RelayResponse(status_code=200, _content=playlist),
            ]
        )
        mock_build_camera_request.return_value = mock_camera_request

        result = await proxy_hls(
            require_uuid(mock_camera.id),
            "cam-preview/index.m3u8",
            AsyncMock(),
            mock_user,
            AsyncMock(),
        )

        assert result.body == playlist
        assert mock_camera_request.await_count == 3
        assert mock_sleep.await_args_list == [
            ((hls_mod._MANIFEST_RETRY_BACKOFF_S[0],), {}),
            ((hls_mod._MANIFEST_RETRY_BACKOFF_S[1],), {}),
        ]

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_manifest_raises_last_404_after_retry_budget_exhausted(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_sleep: AsyncMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """Manifest retries should stop after the configured backoff budget."""
        mock_get_cam.return_value = mock_camera
        last_exc = HTTPException(status_code=404, detail="still not ready")
        mock_camera_request = AsyncMock(side_effect=[last_exc] * (len(hls_mod._MANIFEST_RETRY_BACKOFF_S) + 1))
        mock_build_camera_request.return_value = mock_camera_request

        with pytest.raises(HTTPException) as exc_info:
            await proxy_hls(
                require_uuid(mock_camera.id),
                "cam-preview/index.m3u8",
                AsyncMock(),
                mock_user,
                AsyncMock(),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "still not ready"
        assert mock_camera_request.await_count == len(hls_mod._MANIFEST_RETRY_BACKOFF_S) + 1
        assert mock_sleep.await_count == len(hls_mod._MANIFEST_RETRY_BACKOFF_S)

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
    async def test_segment_404_is_not_retried(
        self,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_sleep: AsyncMock,
        mock_camera: Camera,
        mock_user: User,
    ) -> None:
        """Segments should fail immediately; only manifests get retries."""
        mock_get_cam.return_value = mock_camera
        mock_camera_request = AsyncMock(side_effect=HTTPException(status_code=404, detail="missing segment"))
        mock_build_camera_request.return_value = mock_camera_request

        with pytest.raises(HTTPException) as exc_info:
            await proxy_hls(
                require_uuid(mock_camera.id),
                "cam-preview/segment0.mp4",
                AsyncMock(),
                mock_user,
                AsyncMock(),
            )

        assert exc_info.value.status_code == 404
        mock_camera_request.assert_awaited_once()
        mock_sleep.assert_not_awaited()
