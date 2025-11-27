"""Utilities for the camera interaction endpoints."""

from enum import Enum
from urllib.parse import urljoin

from fastapi import HTTPException
from httpx import AsyncClient, Headers, HTTPStatusError, QueryParams, Response, RequestError
import logging
from pydantic import UUID4
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.utils import get_user_owned_object
from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus


class HttpMethod(str, Enum):
    """HTTP method type."""

    GET = "GET"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


async def get_user_owned_camera(session: AsyncSession, camera_id: UUID4, user_id: UUID4) -> Camera:
    """Get a camera owned by a user."""
    camera = await get_user_owned_object(session, Camera, camera_id, user_id)

    camera_status = await camera.get_status()

    if (camera_connection := camera_status.connection) != CameraConnectionStatus.ONLINE:
        status_code, msg = camera_connection.to_http_error()
        raise HTTPException(status_code=status_code, detail=msg)

    return camera


async def fetch_from_camera_url(
    camera: Camera,
    endpoint: str,
    method: HttpMethod,
    headers: Headers | None = None,
    error_msg: str | None = None,
    query_params: QueryParams | None = None,
    body: dict | None = None,
    *,
    follow_redirects: bool = True,
) -> Response:
    """Utility function to send HTTP requests to the camera API."""
    # Add camera auth header to request
    if headers is None:
        headers = Headers()
    headers.update(camera.auth_headers)

    async with AsyncClient(
        headers=headers, timeout=5.0, verify=camera.verify_ssl, follow_redirects=follow_redirects
    ) as client:
        try:
            url = urljoin(str(camera.url), endpoint)
            response = await client.request(method.value, url, params=query_params, json=body)
            response.raise_for_status()
        except HTTPStatusError as e:
            if error_msg is None:
                error_msg = f"Failed to {method.value} {endpoint}"
            raise HTTPException(
                status_code=e.response.status_code,
                detail={"main API": error_msg, "Camera API": e.response.json().get("detail")},
            ) from e
        except RequestError as e:
            # Network-level errors (DNS, connection refused, timeouts).
            logger = logging.getLogger(__name__)
            logger.warning("Network error contacting camera %s%s: %s", camera.url, endpoint, e)
            raise HTTPException(status_code=503, detail={
                "main API": f"Network error contacting camera: {endpoint}",
                "error": str(e),
            }) from e
        else:
            return response
