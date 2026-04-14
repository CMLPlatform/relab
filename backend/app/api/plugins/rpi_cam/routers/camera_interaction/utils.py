"""Utilities for the camera interaction endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException

from app.api.common.ownership import get_user_owned_object
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from app.api.plugins.rpi_cam.websocket.relay import relay_via_websocket

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession


async def get_user_owned_camera(
    session: AsyncSession, camera_id: UUID4, user_id: UUID4
) -> Camera:
    """Get a camera owned by a user, verifying it is connected."""
    camera = await get_user_owned_object(session, Camera, camera_id, user_id)
    camera_status = await camera.get_status(force_refresh=True)

    if (camera_connection := camera_status.connection) != CameraConnectionStatus.ONLINE:
        status_code, msg = camera_connection.to_http_error()
        raise HTTPException(status_code=status_code, detail=msg)

    return camera


async def fetch_from_camera_url(
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    error_msg: str | None = None,
    body: dict | None = None,
    *,
    expect_binary: bool = False,
) -> RelayResponse:
    """Send a request to the camera through its active WebSocket relay."""
    return await relay_via_websocket(
        camera.id,
        method.value,
        endpoint,
        body=body,
        error_msg=error_msg,
        expect_binary=expect_binary,
    )


def build_camera_request(
    camera: Camera,
) -> Callable[..., Awaitable[RelayResponse]]:
    """Build a reusable request callable bound to one camera and shared client."""

    async def request(
        endpoint: str,
        method: HttpMethod,
        error_msg: str | None = None,
        body: dict | None = None,
        *,
        expect_binary: bool = False,
    ) -> RelayResponse:
        return await fetch_from_camera_url(
            camera=camera,
            endpoint=endpoint,
            method=method,
            error_msg=error_msg,
            body=body,
            expect_binary=expect_binary,
        )

    return request
