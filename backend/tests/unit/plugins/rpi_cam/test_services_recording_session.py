"""Unit tests for cached YouTube recording-session helpers."""
# ruff: noqa: ANN401 — shared mock_session fixture is typed as Any by design

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.common.exceptions import ConflictError, ServiceUnavailableError
from app.api.plugins.rpi_cam.services import (
    YOUTUBE_RECORDING_SESSION_TTL_SECONDS,
    load_recording_session,
    store_recording_session,
)

if TYPE_CHECKING:
    from typing import Any


@patch("app.api.plugins.rpi_cam.service_runtime.set_redis_value", new_callable=AsyncMock, return_value=False)
async def test_store_recording_session_raises_internal_error_when_redis_set_fails(
    mock_set_redis_value: AsyncMock, mock_session: Any
) -> None:
    """Failed Redis writes should surface as internal API errors."""
    redis_mock = AsyncMock()
    session = MagicMock()
    session.model_dump_json.return_value = '{"product_id":1}'
    mock_session.get.side_effect = [None, MagicMock()]

    with pytest.raises(ServiceUnavailableError, match="Failed to store YouTube recording session in Redis"):
        await store_recording_session(redis_mock, mock_session, uuid4(), session)

    mock_set_redis_value.assert_awaited_once()
    assert mock_session.delete.await_count == 1


@patch("app.api.plugins.rpi_cam.service_runtime.set_redis_value", new_callable=AsyncMock, return_value=True)
async def test_store_recording_session_uses_48_hour_ttl(
    mock_set_redis_value: AsyncMock, mock_session: Any
) -> None:
    """Recording sessions should live long enough for long-running broadcasts."""
    redis_mock = AsyncMock()
    camera_id = uuid4()
    session = MagicMock()
    session.model_dump_json.return_value = '{"product_id":1}'

    await store_recording_session(redis_mock, mock_session, camera_id, session)

    mock_set_redis_value.assert_awaited_once_with(
        redis_mock,
        f"rpi_cam:youtube_recording:{camera_id}",
        '{"product_id":1}',
        ex=60 * 60 * 48,
    )
    assert YOUTUBE_RECORDING_SESSION_TTL_SECONDS == 60 * 60 * 48
    assert mock_session.commit.await_count == 1


@patch("app.api.plugins.rpi_cam.service_runtime.get_redis_value", new_callable=AsyncMock, return_value=None)
async def test_load_recording_session_raises_conflict_when_missing(
    mock_get_redis_value: AsyncMock, mock_session: Any
) -> None:
    """Missing cached recording sessions should raise a conflict error."""
    redis_mock = AsyncMock()
    mock_session.get.return_value = None

    with pytest.raises(ConflictError, match="No cached YouTube recording session found"):
        await load_recording_session(redis_mock, mock_session, uuid4())

    mock_get_redis_value.assert_awaited_once()


@patch("app.api.plugins.rpi_cam.service_runtime.get_redis_value", new_callable=AsyncMock)
async def test_load_recording_session_falls_back_to_db_on_invalid_payload(
    mock_get_redis_value: AsyncMock, mock_session: Any
) -> None:
    """Invalid cached payloads should fall back to the durable DB row."""
    redis_mock = AsyncMock()
    mock_get_redis_value.return_value = '{"product_id":"not-an-int"}'
    mock_session.get.return_value = MagicMock(
        product_id=1,
        title="title",
        description="desc",
        stream_url="https://example.com/live",
        broadcast_key="broadcast",
        video_metadata={"fps": 30},
    )

    loaded = await load_recording_session(redis_mock, mock_session, uuid4())

    assert loaded.broadcast_key == "broadcast"
    assert loaded.product_id == 1


@patch("app.api.plugins.rpi_cam.service_runtime.get_redis_value", new_callable=AsyncMock, return_value=None)
@patch("app.api.plugins.rpi_cam.service_runtime.set_redis_value", new_callable=AsyncMock, return_value=True)
async def test_load_recording_session_repopulates_redis_from_db_backstop(
    mock_set_redis_value: AsyncMock,
    mock_get_redis_value: AsyncMock,
    mock_session: Any,
) -> None:
    """A Redis miss should be healed from the durable DB row."""
    camera_id = uuid4()
    redis_mock = AsyncMock()
    mock_session.get.return_value = MagicMock(
        product_id=2,
        title="title",
        description="desc",
        stream_url="https://example.com/live",
        broadcast_key="broadcast",
        video_metadata={"fps": 30},
    )

    loaded = await load_recording_session(redis_mock, mock_session, camera_id)

    assert loaded.broadcast_key == "broadcast"
    mock_get_redis_value.assert_awaited_once()
    mock_set_redis_value.assert_awaited_once()
