"""LL-HLS proxy for browser + native live preview.

The player requests ``GET /plugins/rpi-cam/cameras/{camera_id}/hls/cam-preview/index.m3u8``;
the backend forwards it through the WebSocket relay to the Pi's ``GET /preview/hls/{rest}``,
which proxies its local MediaMTX LL-HLS listener on port 8888. ``{rest}`` also catches the
segment and part URLs the player resolves relative to the playlist; those return as
binary relay frames.
"""

import asyncio

from fastapi import HTTPException, Response
from pydantic import UUID4

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.audiences import PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.runtime.relay import build_camera_request, get_user_owned_camera
from app.core.redis import RedisDep

# Exponential backoff for LL-HLS manifest 404 retries. Totals ~7.75s; fast at the
# start for the hot path, longer tail for a cold MediaMTX warm-up.
_MANIFEST_RETRY_BACKOFF_S: tuple[float, ...] = (0.25, 0.5, 1.0, 2.0, 4.0)
_ALLOWED_HLS_SUFFIXES = (".m3u8", ".mp4", ".m4s")
_ALLOWED_HLS_PATH_PUNCTUATION = frozenset("/._-")
_PARENT_SEGMENT = ".."

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
    redis: RedisDep,
) -> Response:
    """Proxy an LL-HLS URL through the camera's WebSocket relay."""
    _validate_hls_path(hls_path)
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)
    camera_request = build_camera_request(camera, redis)

    # MediaMTX needs a few seconds after the first viewer before the playlist is valid.
    # Retry 404s on manifest requests only; segments are never retried.
    media_type = _resolve_media_type(hls_path)
    is_manifest = hls_path.endswith(".m3u8")
    max_attempts = len(_MANIFEST_RETRY_BACKOFF_S) + 1 if is_manifest else 1
    last_exc: HTTPException | None = None
    for attempt in range(max_attempts):
        if attempt:
            await asyncio.sleep(_MANIFEST_RETRY_BACKOFF_S[attempt - 1])
        try:
            relay_response = await camera_request(
                endpoint=f"/preview/hls/{hls_path}",
                method=HttpMethod.GET,
                error_msg="Failed to fetch HLS data",
            )
            break
        except HTTPException as exc:
            if exc.status_code == 404 and attempt < max_attempts - 1:
                last_exc = exc
                continue
            raise
    else:
        if last_exc is None:
            raise HTTPException(status_code=404, detail="HLS manifest is not yet available")
        raise last_exc
    return Response(
        content=relay_response.content,
        media_type=media_type,
        headers={
            # LL-HLS wants fresh data on every request; the player manages its own buffer.
            "Cache-Control": "no-store",
        },
    )


def _validate_hls_path(hls_path: str) -> None:
    """Reject paths that could escape the camera's HLS relay surface."""
    segments = hls_path.split("/")
    if (
        not hls_path
        or hls_path.startswith("/")
        or _PARENT_SEGMENT in segments
        or not hls_path.endswith(_ALLOWED_HLS_SUFFIXES)
        or any(
            not char.isascii() or (not char.isalnum() and char not in _ALLOWED_HLS_PATH_PUNCTUATION)
            for char in hls_path
        )
    ):
        raise HTTPException(status_code=400, detail="Invalid HLS path.")


def _resolve_media_type(hls_path: str) -> str:
    """Map a MediaMTX LL-HLS path to its HTTP content type."""
    if hls_path.endswith(".m3u8"):
        return "application/vnd.apple.mpegurl"
    if hls_path.endswith(".mp4"):
        return "video/mp4"
    # MediaMTX also serves ``.m4s`` / raw fMP4 parts.
    return "application/octet-stream"
