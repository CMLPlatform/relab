"""Unit tests for the RPi Cam LL-HLS proxy router."""
# spell-checker: ignore ftypmp, EXTM
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.auth.models import User
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.relay_response import RelayResponse
from app.api.plugins.rpi_cam.routers.camera_interaction import hls as hls_mod
from app.api.plugins.rpi_cam.routers.camera_interaction.hls import proxy_hls

if TYPE_CHECKING:
    from uuid import UUID

def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value

@patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
async def test_playlist_request_forwarded_and_returned_as_hls_text(

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

@pytest.mark.parametrize(
    "hls_path",
    [
        "../system/telemetry",
        "/system/telemetry",
        "http://example.test/x.m3u8",
        "cam-preview\\index.m3u8",
        "cam-preview/%2e%2e/secret.m3u8",
        "cam-preview/segment 0.mp4",
        "cam-preview/index.txt",
        "",
    ],
)
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.hls.build_camera_request")
async def test_hls_path_guard_rejects_unsafe_paths_before_relay(

    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    hls_path: str,
    mock_camera: Camera,
    mock_user: User,
) -> None:
    """Unsafe HLS paths should fail before camera ownership or relay work."""
    mock_get_cam.return_value = mock_camera

    with pytest.raises(HTTPException) as exc_info:
        await proxy_hls(
            require_uuid(mock_camera.id),
            hls_path,
            AsyncMock(),
            mock_user,
            AsyncMock(),
        )

    assert exc_info.value.status_code == 400
    mock_get_cam.assert_not_awaited()
    mock_build_camera_request.assert_not_called()

