"""LL-HLS proxy for browser + native live preview.

The browser/native video player asks for:

    GET /plugins/rpi-cam/cameras/{camera_id}/hls/cam-preview/index.m3u8

and the backend forwards it through the WebSocket relay to the Pi's own
``GET /hls/{rest}`` endpoint, which proxies to its local MediaMTX LL-HLS
listener on port 8888. Segment fetches (``.mp4``) follow the same path and
come back as binary relay frames. The frontend constructs the URL itself from
the camera id; no signed-URL dance needed.

The ``{rest}`` path catches both the playlist (``cam-preview/index.m3u8``) and
every segment/part URL the player dereferences (``cam-preview/segment0.mp4``,
``cam-preview/part0.mp4``, etc.) since LL-HLS resolves segments relative to
the playlist URL.
"""
# spell-checker: ignore mpegurl

from __future__ import annotations

from fastapi import Response
from pydantic import UUID4

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    build_camera_request,
    get_user_owned_camera,
)
from app.core.redis import OptionalRedisDep

router = PublicAPIRouter()


@router.get(
    "/{camera_id}/hls/{hls_path:path}",
    summary="Proxy LL-HLS playlists and segments from the camera's MediaMTX",
    description=(
        "Forward an LL-HLS request to the camera over its WebSocket relay. "
        "Playlist requests return ``application/vnd.apple.mpegurl`` text; "
        "segment/part requests return binary ``video/mp4`` or ``video/iso.segment``. "
        "The frontend simply points ``hls.js`` / ``expo-video`` at this URL and the "
        "player walks the manifest on its own."
    ),
)
async def proxy_hls(
    camera_id: UUID4,
    hls_path: str,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: OptionalRedisDep,
) -> Response:
    """Proxy an LL-HLS URL through the camera's WebSocket relay."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera)
    relay_response = await camera_request(
        endpoint=f"/hls/{hls_path}",
        method=HttpMethod.GET,
        error_msg="Failed to fetch HLS data",
        expect_binary=True,
    )
    media_type = _resolve_media_type(hls_path)
    return Response(
        content=relay_response.content,
        media_type=media_type,
        headers={
            # LL-HLS wants fresh data on every request — no caching at any
            # intermediate layer. The player manages its own buffer.
            "Cache-Control": "no-store",
        },
    )


def _resolve_media_type(hls_path: str) -> str:
    """Map a MediaMTX LL-HLS path to its HTTP content type."""
    if hls_path.endswith(".m3u8"):
        return "application/vnd.apple.mpegurl"
    if hls_path.endswith(".mp4"):
        return "video/mp4"
    # MediaMTX also serves ``.m4s`` / raw fMP4 parts; fall back to a generic
    # binary type so the player can still walk them.
    return "application/octet-stream"
