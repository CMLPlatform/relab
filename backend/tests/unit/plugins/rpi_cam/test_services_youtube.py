"""Unit tests for YouTube-facing RPi Cam service helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest
from httpx import Request, Response

from app.api.plugins.rpi_cam.exceptions import GoogleOAuthAssociationRequiredError
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services import YOUTUBE_API_BASE_URL, YouTubeAPIError, YouTubeService
from tests.unit.plugins.rpi_cam.service_test_support import (
    FAKE_ACCESS_TOKEN,
    FAKE_BROADCAST_ID,
    FAKE_REFRESH_TOKEN,
    FAKE_STREAM_ID,
    FAKE_STREAM_NAME,
    NEW_FAKE_ACCESS_TOKEN,
    TEST_STREAM_TITLE,
)


async def test_refresh_token_if_needed_not_expired(youtube_service: YouTubeService) -> None:
    """Token refresh should be skipped while the access token is still valid."""
    await youtube_service.refresh_token_if_needed()
    google_client = cast("Any", youtube_service.google_oauth_client)
    google_client.refresh_token.assert_not_called()


async def test_refresh_token_if_needed_expired_success(youtube_service: YouTubeService) -> None:
    """Expired tokens should be refreshed and persisted."""
    oauth_account = cast("Any", youtube_service.oauth_account)
    oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()

    google_client = cast("Any", youtube_service.google_oauth_client)
    google_client.refresh_token.return_value = {"access_token": NEW_FAKE_ACCESS_TOKEN, "expires_in": 3600}

    await youtube_service.refresh_token_if_needed()

    google_client.refresh_token.assert_called_once_with(FAKE_REFRESH_TOKEN)
    assert oauth_account.access_token == NEW_FAKE_ACCESS_TOKEN
    session = cast("Any", youtube_service.session)
    session.add.assert_called_once()
    session.commit.assert_awaited_once()


async def test_refresh_token_missing_token(youtube_service: YouTubeService) -> None:
    """Refreshing without a refresh token should fail loudly."""
    oauth_account = cast("Any", youtube_service.oauth_account)
    oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()
    oauth_account.refresh_token = None

    with pytest.raises(GoogleOAuthAssociationRequiredError, match="Google OAuth account association required"):
        await youtube_service.refresh_token_if_needed()


async def test_request_youtube_api_uses_bearer_auth(youtube_service: YouTubeService) -> None:
    """YouTube API requests should use bearer authentication."""
    response = Response(200, json={"ok": True}, request=Request("GET", "https://www.googleapis.com/youtube/v3/test"))
    http_client = cast("Any", youtube_service.http_client)
    http_client.request.return_value = response

    result = await youtube_service.request_youtube_api("GET", "test")

    assert result == {"ok": True}
    http_client.request.assert_awaited_once_with(
        "GET",
        "https://www.googleapis.com/youtube/v3/test",
        params=None,
        json=None,
        headers={"Authorization": f"Bearer {FAKE_ACCESS_TOKEN}"},
    )


async def test_request_youtube_api_retries_on_503(
    youtube_service: YouTubeService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Transient 5xx responses must retry and then succeed."""
    monkeypatch.setattr("app.api.plugins.rpi_cam.services.asyncio.sleep", AsyncMock())
    request = Request("GET", f"{YOUTUBE_API_BASE_URL}/test-endpoint")
    failure = Response(503, json={"error": {"message": "try later"}}, request=request)
    success = Response(200, json={"ok": True}, request=request)
    http_client = cast("Any", youtube_service.http_client)
    http_client.request.side_effect = [failure, success]

    result = await youtube_service.request_youtube_api("GET", "test-endpoint")

    assert result == {"ok": True}
    assert http_client.request.await_count == 2


async def test_request_youtube_api_does_not_retry_4xx(
    youtube_service: YouTubeService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """4xx responses must raise immediately without retrying."""
    monkeypatch.setattr("app.api.plugins.rpi_cam.services.asyncio.sleep", AsyncMock())
    request = Request("POST", f"{YOUTUBE_API_BASE_URL}/liveBroadcasts")
    http_client = cast("Any", youtube_service.http_client)
    http_client.request.return_value = Response(403, json={"error": {"message": "forbidden"}}, request=request)

    with pytest.raises(YouTubeAPIError) as excinfo:
        await youtube_service.request_youtube_api("POST", "liveBroadcasts")

    assert excinfo.value.http_status_code == 403
    http_client.request.assert_awaited_once()


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_end_livestream_success(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """Ending a livestream should call the delete endpoint once."""
    del mock_refresh
    await youtube_service.end_livestream(FAKE_BROADCAST_ID)
    mock_request_youtube_api.assert_awaited_once_with(
        "DELETE",
        "liveBroadcasts",
        params={"id": FAKE_BROADCAST_ID},
    )


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_setup_livestream_success(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """Setting up a livestream should return the expected stream config."""
    del mock_refresh
    mock_request_youtube_api.side_effect = [
        {"id": FAKE_BROADCAST_ID},
        {"id": FAKE_STREAM_ID, "cdn": {"ingestionInfo": {"streamName": FAKE_STREAM_NAME}}},
        {"id": FAKE_BROADCAST_ID},
    ]

    result = await youtube_service.setup_livestream(TEST_STREAM_TITLE)

    assert result.stream_key.get_secret_value() == FAKE_STREAM_NAME
    assert result.broadcast_key.get_secret_value() == FAKE_BROADCAST_ID
    assert result.stream_id == FAKE_STREAM_ID


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_validate_stream_status_active(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """An active stream status should validate successfully."""
    del mock_refresh
    mock_request_youtube_api.return_value = {"items": [{"status": {"streamStatus": "active"}}]}
    assert await youtube_service.validate_stream_status(FAKE_STREAM_ID) is True


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_get_broadcast_monitor_stream_success(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """Fetching the monitor stream should map to the public schema."""
    del mock_refresh
    mock_request_youtube_api.return_value = {
        "items": [
            {
                "id": FAKE_BROADCAST_ID,
                "contentDetails": {
                    "monitorStream": {
                        "enableMonitorStream": True,
                        "broadcastStreamDelayMs": 0,
                        "embedHtml": "<iframe />",
                    }
                },
            }
        ]
    }

    result = await youtube_service.get_broadcast_monitor_stream(FAKE_BROADCAST_ID)

    assert result == YouTubeMonitorStreamResponse(
        enableMonitorStream=True,
        broadcastStreamDelayMs=0,
        embedHtml="<iframe />",
    )


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_setup_livestream_invalid_stream_response(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """Invalid stream payloads should surface as API errors."""
    del mock_refresh
    mock_request_youtube_api.side_effect = [{"id": FAKE_BROADCAST_ID}, {"id": FAKE_STREAM_ID}]

    with pytest.raises(YouTubeAPIError) as exc_info:
        await youtube_service.setup_livestream(TEST_STREAM_TITLE)

    assert exc_info.value.details is not None
    assert "Invalid YouTube stream response" in exc_info.value.details


@patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
@patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
async def test_validate_stream_status_missing_items(
    mock_refresh: AsyncMock,
    mock_request_youtube_api: AsyncMock,
    youtube_service: YouTubeService,
) -> None:
    """Missing stream items should be treated as API errors."""
    del mock_refresh
    mock_request_youtube_api.return_value = {"items": []}

    with pytest.raises(YouTubeAPIError) as exc_info:
        await youtube_service.validate_stream_status(FAKE_STREAM_ID)

    assert exc_info.value.details is not None
    assert "stream not found" in exc_info.value.details
