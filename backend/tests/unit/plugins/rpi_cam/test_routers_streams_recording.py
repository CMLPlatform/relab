"""Unit tests for recording-focused RPi Cam stream router behavior."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import Response

from app.api.auth.exceptions import UserOwnershipError
from app.api.auth.models import OAuthAccount
from app.api.common.exceptions import ServiceUnavailableError
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Video
from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT
from app.api.plugins.rpi_cam.routers.camera_interaction.streams import (
    YouTubePrivacyStatus,
    get_recording_monitor_stream,
    start_recording,
    stop_recording,
)
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from tests.unit.plugins.rpi_cam.stream_router_test_support import (
    FAKE_ACCESS_TOKEN,
    FAKE_ACCOUNT_EMAIL,
    FAKE_ACCOUNT_ID,
    FAKE_BROADCAST_KEY,
    HTTP_NO_CONTENT,
    HTTP_OK,
    YOUTUBE_STREAM_URL,
    build_stream_config,
    build_user,
    require_uuid,
)

if TYPE_CHECKING:
    from app.api.plugins.rpi_cam.models import Camera


def build_oauth_account() -> OAuthAccount:
    """Return a typed OAuth account for stream-router tests."""
    return OAuthAccount(
        id=uuid4(),
        user_id=uuid4(),
        oauth_name="google",
        access_token=FAKE_ACCESS_TOKEN,
        expires_at=None,
        refresh_token=None,
        account_id=FAKE_ACCOUNT_ID,
        account_email=FAKE_ACCOUNT_EMAIL,
    )


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_object")
async def test_start_recording(
    mock_product_ownership: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Starting recording should create a YouTube session and cache it."""
    del mock_product_ownership
    mock_get_cam.return_value = mock_camera

    session_mock = AsyncMock()
    oauth_account = build_oauth_account()
    session_mock.scalar.return_value = oauth_account
    session_mock.get.return_value = None
    session_mock.add = MagicMock()

    mock_yt_service = AsyncMock()
    mock_yt_service.setup_livestream.return_value = build_stream_config()
    mock_yt_service.validate_stream_status.return_value = True
    mock_yt_service_class.return_value = mock_yt_service
    mock_camera_request = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    mock_build_camera_request.return_value = mock_camera_request

    redis_mock = AsyncMock()
    redis_mock.get.return_value = None
    user_mock = build_user()
    http_client = AsyncMock()
    camera_id = require_uuid(mock_camera.id)

    result = await start_recording(
        camera_id=camera_id,
        session=session_mock,
        http_client=http_client,
        redis=redis_mock,
        current_user=user_mock,
        product_id=1,
        title="Test",
        description="Test Desc",
        privacy_status=YouTubePrivacyStatus.PRIVATE,
    )

    assert str(result.url) == f"{YOUTUBE_STREAM_URL}/"
    assert mock_camera_request.await_args_list[0].kwargs["endpoint"] == PLUGIN_STREAM_ENDPOINT
    redis_mock.set.assert_awaited_once()
    cache_key, payload = redis_mock.set.await_args.args[:2]
    assert cache_key == f"rpi_cam:youtube_recording:{camera_id}"
    cached_session = json.loads(payload)
    assert cached_session["product_id"] == 1


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_object")
async def test_start_recording_rejects_product_not_owned_by_camera_owner(
    mock_get_owned_product: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Recording may only attach videos to products owned by the camera owner."""
    user_mock = build_user()
    foreign_product_id = 1
    mock_get_cam.return_value = mock_camera
    mock_get_owned_product.side_effect = UserOwnershipError(Product, foreign_product_id, require_uuid(user_mock.id))

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()

    with pytest.raises(UserOwnershipError):
        await start_recording(
            camera_id=require_uuid(mock_camera.id),
            session=session_mock,
            http_client=AsyncMock(),
            redis=AsyncMock(),
            current_user=user_mock,
            product_id=foreign_product_id,
            title="Test",
            description="Test Desc",
            privacy_status=YouTubePrivacyStatus.PRIVATE,
        )

    mock_yt_service_class.assert_not_called()


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.create_video", new_callable=AsyncMock)
async def test_stop_recording(
    mock_create_video: AsyncMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Stopping recording should end YouTube and persist the video row."""
    mock_get_cam.return_value = mock_camera
    redis_mock = AsyncMock()
    redis_mock.get.return_value = json.dumps(
        {
            "product_id": 1,
            "title": "Test",
            "description": "Test Desc",
            "stream_url": f"{YOUTUBE_STREAM_URL}/",
            "broadcast_key": FAKE_BROADCAST_KEY,
            "video_metadata": {"camera_properties": {}, "capture_metadata": {}},
        }
    )
    mock_yt_service = AsyncMock()
    mock_yt_service.end_livestream.return_value = None
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = AsyncMock(return_value=Response(HTTP_NO_CONTENT))
    mock_create_video.return_value = Video(
        id=1,
        url=YOUTUBE_STREAM_URL,
        title="Test",
        description="Test Desc",
        product_id=1,
        video_metadata={"camera_properties": {}, "capture_metadata": {}},
    )

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()
    user_mock = build_user()
    camera_id = require_uuid(mock_camera.id)
    http_client = AsyncMock()

    result = await stop_recording(
        camera_id=camera_id,
        session=session_mock,
        http_client=http_client,
        redis=redis_mock,
        current_user=user_mock,
    )

    assert str(result.url) == YOUTUBE_STREAM_URL
    assert result.product_id == 1
    mock_yt_service.end_livestream.assert_awaited_once_with(FAKE_BROADCAST_KEY)
    redis_mock.delete.assert_awaited_once_with(f"rpi_cam:youtube_recording:{camera_id}")


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
async def test_get_recording_monitor_stream(
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Fetching the monitor stream should delegate to YouTubeService."""
    mock_get_cam.return_value = mock_camera
    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()

    monitor_stream = YouTubeMonitorStreamResponse(
        enableMonitorStream=True,
        broadcastStreamDelayMs=0,
        embedHtml="<iframe />",
    )
    mock_yt_service = AsyncMock()
    mock_yt_service.get_broadcast_monitor_stream.return_value = monitor_stream
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "provider": "youtube",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    redis_mock = AsyncMock()
    redis_mock.get.return_value = json.dumps(
        {
            "product_id": 1,
            "title": "Test",
            "description": "Test Desc",
            "stream_url": f"{YOUTUBE_STREAM_URL}/",
            "broadcast_key": FAKE_BROADCAST_KEY,
            "video_metadata": {"camera_properties": {}, "capture_metadata": {}},
        }
    )

    result = await get_recording_monitor_stream(
        require_uuid(mock_camera.id),
        session_mock,
        AsyncMock(),
        redis_mock,
        build_user(),
    )

    assert result == monitor_stream


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.create_video", new_callable=AsyncMock)
async def test_stop_recording_ends_youtube_when_camera_offline(
    mock_create_video: AsyncMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """A Pi outage must not prevent YouTube teardown."""
    mock_get_cam.return_value = mock_camera
    redis_mock = AsyncMock()
    redis_mock.get.return_value = json.dumps(
        {
            "product_id": 1,
            "title": "Test",
            "description": "Test Desc",
            "stream_url": f"{YOUTUBE_STREAM_URL}/",
            "broadcast_key": FAKE_BROADCAST_KEY,
            "video_metadata": {"camera_properties": {}, "capture_metadata": {}},
        }
    )
    call_order: list[str] = []

    async def _camera_request(**kwargs: object) -> Response:
        call_order.append(str(kwargs.get("endpoint")))
        error_message = "camera offline"
        raise ServiceUnavailableError(error_message)

    async def _end_livestream(*_args: object, **_kwargs: object) -> None:
        call_order.append("youtube_end")

    mock_yt_service = AsyncMock()
    mock_yt_service.end_livestream.side_effect = _end_livestream
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = _camera_request
    mock_create_video.return_value = Video(
        id=1,
        url=YOUTUBE_STREAM_URL,
        title="Test",
        description="Test Desc",
        product_id=1,
        video_metadata={"camera_properties": {}, "capture_metadata": {}},
    )

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()
    camera_id = require_uuid(mock_camera.id)

    result = await stop_recording(
        camera_id=camera_id,
        session=session_mock,
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
    )

    assert call_order[0] == "youtube_end"
    assert call_order[1] == PLUGIN_STREAM_ENDPOINT
    mock_create_video.assert_awaited_once()
    assert result.product_id == 1


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_object")
async def test_start_recording_is_idempotent_when_session_already_active(
    mock_product_ownership: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """A retry of start_recording must return the live stream view without creating a second broadcast."""
    del mock_product_ownership
    mock_get_cam.return_value = mock_camera

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()
    mock_yt_service = AsyncMock()
    mock_yt_service_class.return_value = mock_yt_service

    redis_mock = AsyncMock()
    redis_mock.get.return_value = json.dumps(
        {
            "product_id": 1,
            "title": "Test",
            "description": "Test Desc",
            "stream_url": f"{YOUTUBE_STREAM_URL}/",
            "broadcast_key": FAKE_BROADCAST_KEY,
            "video_metadata": {"camera_properties": {}, "capture_metadata": {}},
        }
    )
    mock_camera_request = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    mock_build_camera_request.return_value = mock_camera_request

    result = await start_recording(
        camera_id=require_uuid(mock_camera.id),
        session=session_mock,
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
        product_id=1,
        title="Test",
        description="Test Desc",
        privacy_status=YouTubePrivacyStatus.PRIVATE,
    )

    assert str(result.url) == f"{YOUTUBE_STREAM_URL}/"
    mock_yt_service.setup_livestream.assert_not_called()
    mock_camera_request.assert_awaited_once()
    verify_call = mock_camera_request.await_args
    assert verify_call is not None
    assert verify_call.kwargs["endpoint"] == PLUGIN_STREAM_ENDPOINT
    assert verify_call.kwargs["method"].name == "GET"
    redis_mock.set.assert_not_awaited()
