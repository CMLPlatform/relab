"""Utilities for the camera interaction endpoints."""

from __future__ import annotations

import json
import logging
from enum import StrEnum
from typing import TYPE_CHECKING
from urllib.parse import urljoin

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from httpx import AsyncClient, Headers, HTTPStatusError, QueryParams, RequestError
from httpx import Response as HTTPXResponse
from starlette.background import BackgroundTask

from app.api.common.ownership import get_user_owned_object
from app.api.plugins.rpi_cam.exceptions import CameraProxyRequestError
from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, ConnectionMode
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from app.api.plugins.rpi_cam.websocket.relay import relay_via_websocket
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from pydantic import UUID4
    from sqlmodel.ext.asyncio.session import AsyncSession


class HttpMethod(StrEnum):
    """HTTP method type."""

    GET = "GET"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


async def get_user_owned_camera(
    session: AsyncSession, camera_id: UUID4, user_id: UUID4, http_client: AsyncClient
) -> Camera:
    """Get a camera owned by a user, verifying it is reachable."""
    camera = await get_user_owned_object(session, Camera, camera_id, user_id)

    camera_status = await camera.get_status(http_client)

    if (camera_connection := camera_status.connection) != CameraConnectionStatus.ONLINE:
        status_code, msg = camera_connection.to_http_error()
        raise HTTPException(status_code=status_code, detail=msg)

    return camera


async def fetch_from_camera_url(
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    http_client: AsyncClient,
    headers: Headers | None = None,
    error_msg: str | None = None,
    query_params: QueryParams | None = None,
    body: dict | None = None,
    *,
    follow_redirects: bool = True,
    expect_binary: bool = False,
) -> HTTPXResponse | RelayResponse:
    """Utility function to send a request to the camera API.

    For WebSocket-mode cameras the request is relayed through the active
    WebSocket tunnel. For HTTP-mode cameras the existing outbound HTTP logic
    is used.
    """
    if camera.connection_mode == ConnectionMode.WEBSOCKET:
        params_dict = dict(query_params) if query_params else None
        return await relay_via_websocket(
            camera.id,
            method.value,
            endpoint,
            params=params_dict,
            body=body,
            error_msg=error_msg,
            expect_binary=expect_binary,
        )

    # Add camera auth header to request
    if headers is None:
        headers = Headers()
    headers.update({key: value.get_secret_value() for key, value in camera.auth_headers.items()})

    return await _fetch_from_camera_via_http(
        http_client,
        camera,
        endpoint,
        method,
        headers,
        error_msg,
        query_params,
        body,
        follow_redirects=follow_redirects,
    )


async def _fetch_from_camera_via_http(
    client: AsyncClient,
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    headers: Headers,
    error_msg: str | None,
    query_params: QueryParams | None,
    body: dict | None,
    *,
    follow_redirects: bool,
) -> HTTPXResponse:
    """Send an HTTP request to the camera API using the shared client."""
    try:
        url = urljoin(str(camera.url), endpoint)
        request_headers = Headers(client.headers)
        request_headers.update(headers)
        response = await client.request(
            method.value,
            url,
            params=query_params,
            json=body,
            headers=request_headers,
            follow_redirects=follow_redirects,
        )
        response.raise_for_status()
    except HTTPStatusError as e:
        if error_msg is None:
            error_msg = f"Failed to {method.value} {endpoint}"
        raise HTTPException(
            status_code=e.response.status_code,
            detail={"main API": error_msg, "Camera API": _extract_camera_error_detail(e.response)},
        ) from e
    except RequestError as e:
        # Network-level errors (DNS, connection refused, timeouts).
        logger = logging.getLogger(__name__)
        logger.warning(
            "Network error contacting camera %s%s: %s",
            sanitize_log_value(camera.url),
            sanitize_log_value(endpoint),
            sanitize_log_value(e),
        )
        raise CameraProxyRequestError(endpoint, str(e)) from e
    else:
        return response


async def stream_from_camera_url(
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    http_client: AsyncClient,
    headers: Headers | None = None,
    error_msg: str | None = None,
    query_params: QueryParams | None = None,
    body: dict | None = None,
    *,
    follow_redirects: bool = True,
) -> StreamingResponse:
    """Stream camera bytes without buffering the full payload in memory.

    Note: streaming is not supported for WebSocket-mode cameras (HLS/YouTube
    streaming requires the camera to be reachable over HTTP).
    """
    if camera.connection_mode == ConnectionMode.WEBSOCKET:
        raise HTTPException(
            status_code=501,
            detail="Streaming is not supported for WebSocket-relay cameras.",
        )

    if headers is None:
        headers = Headers()
    headers.update({key: value.get_secret_value() for key, value in camera.auth_headers.items()})

    return await _stream_from_camera_via_http(
        http_client,
        camera,
        endpoint,
        method,
        headers,
        error_msg,
        query_params,
        body,
        follow_redirects=follow_redirects,
    )


async def _stream_from_camera_via_http(
    client: AsyncClient,
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    headers: Headers,
    error_msg: str | None,
    query_params: QueryParams | None,
    body: dict | None,
    *,
    follow_redirects: bool,
) -> StreamingResponse:
    """Create a streaming response for an HTTP camera request."""
    try:
        url = urljoin(str(camera.url), endpoint)
        request_headers = Headers(client.headers)
        request_headers.update(headers)
        request = client.build_request(
            method.value,
            url,
            params=query_params,
            json=body,
            headers=request_headers,
        )
        response = await client.send(request, stream=True, follow_redirects=follow_redirects)
        response.raise_for_status()
    except HTTPStatusError as e:
        if error_msg is None:
            error_msg = f"Failed to {method.value} {endpoint}"
        raise HTTPException(
            status_code=e.response.status_code,
            detail={"main API": error_msg, "Camera API": _extract_camera_error_detail(e.response)},
        ) from e
    except RequestError as e:
        logger = logging.getLogger(__name__)
        logger.warning(
            "Network error contacting camera %s%s: %s",
            sanitize_log_value(camera.url),
            sanitize_log_value(endpoint),
            sanitize_log_value(e),
        )
        raise CameraProxyRequestError(endpoint, str(e)) from e
    else:
        # Forward only content-related headers; skip hop-by-hop and server
        # metadata headers that would duplicate the backend's own values.
        skip = {"server", "date", "transfer-encoding", "connection", "keep-alive"}
        proxy_headers = {k: v for k, v in response.headers.items() if k.lower() not in skip}
        return StreamingResponse(
            response.aiter_bytes(),
            status_code=response.status_code,
            headers=proxy_headers,
            background=BackgroundTask(response.aclose),
        )


def _extract_camera_error_detail(response: HTTPXResponse) -> str | dict | list | None:
    """Extract a useful error payload from a camera response without assuming JSON."""
    try:
        payload = response.json()
    except json.JSONDecodeError:
        return response.text or None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        return payload if detail is None else detail
    return payload


def build_camera_request(
    camera: Camera,
    http_client: AsyncClient,
) -> Callable[..., Awaitable[HTTPXResponse | RelayResponse]]:
    """Build a reusable request callable bound to one camera and shared client."""

    async def request(
        endpoint: str,
        method: HttpMethod,
        headers: Headers | None = None,
        error_msg: str | None = None,
        query_params: QueryParams | None = None,
        body: dict | None = None,
        *,
        follow_redirects: bool = True,
        expect_binary: bool = False,
    ) -> HTTPXResponse | RelayResponse:
        return await fetch_from_camera_url(
            camera=camera,
            endpoint=endpoint,
            method=method,
            headers=headers,
            http_client=http_client,
            error_msg=error_msg,
            query_params=query_params,
            body=body,
            follow_redirects=follow_redirects,
            expect_binary=expect_binary,
        )

    return request
