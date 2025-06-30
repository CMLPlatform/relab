"""Router for video streaming endpoints."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Query, Request, Security
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.api.dependencies.auth import verify_request
from app.api.dependencies.camera_management import CameraManagerDependency
from app.api.models.stream import (
    StreamMode,
    StreamView,
    YoutubeConfigRequiredError,
    YoutubeStreamConfig,
)
from app.api.services.camera_manager import ActiveStreamError, YouTubeValidationError
from app.core.config import settings

# Constants
HLS_DIR = settings.hls_path

# Initialize templates
templates = Jinja2Templates(directory=settings.templates_path)

# Initialize router
router = APIRouter(prefix="/stream", tags=["stream"])

# TODO: Consider adding multiplexer for simultaneous streaming to local output and YouTube.
# This would warrant a restructuring from mode as query param to path param:
#  /stream/{mode}/start , /stream/{mode}/status, /stream/{mode}/watch, /stream/{mode}/stop


@router.post("/start", status_code=201, summary="Start streaming video")
async def start_stream(
    camera_manager: CameraManagerDependency,
    mode: Annotated[StreamMode, Query(description="Streaming mode", example="local")],
    youtube_config: Annotated[
        YoutubeStreamConfig | None,
        Body(description="YouTube stream configuration", example={"stream_key": "abc123", "broadcast_key": "def456"}),
    ] = None,
) -> StreamView:
    """Start streaming video with specified mode (youtube or local)."""
    try:
        return await camera_manager.start_streaming(mode, youtube_config=youtube_config)

    except YoutubeConfigRequiredError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except YouTubeValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ActiveStreamError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/status")
async def get_stream_status(camera_manager: CameraManagerDependency) -> StreamView:
    """Get current stream status."""
    if (stream_info := await camera_manager.get_stream_info()) is None:
        raise HTTPException(404, "No stream active")
    return stream_info


@router.get("")
async def status_redirect() -> RedirectResponse:
    """Redirect to stream status."""
    return RedirectResponse(router.url_path_for("get_stream_status"))


@router.get("/hls/{file_path:path}", summary="HLS files for local streaming")
async def hls_file(
    file_path: str,
    camera_manager: CameraManagerDependency,
) -> FileResponse:
    """Serve HLS files for local streaming."""
    # TODO: Use StreamResponse here and in the proxy HLS endpoint of the Main API instead of FileResponse
    if camera_manager.stream.mode != StreamMode.LOCAL:
        raise HTTPException(404, "No local stream active")

    try:
        full_path = (HLS_DIR / file_path).resolve()
        if not (full_path.is_relative_to(HLS_DIR) and full_path.is_file()):
            raise HTTPException(status_code=403, detail="Access to file denied")

        if Path(full_path.name).suffix not in {".m3u8", ".ts"}:
            raise HTTPException(status_code=400, detail="Invalid file type. Only HLS files (.m3u8, .ts) are supported.")

        return FileResponse(path=full_path)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {e!s}") from e


@router.get("/hls", summary="HLS manifest file")
async def hls_manifest(
    camera_manager: CameraManagerDependency,
) -> RedirectResponse:
    """Redirect to HLS manifest file."""
    if camera_manager.stream.mode != StreamMode.LOCAL:
        raise HTTPException(404, "No local stream active")
    return RedirectResponse(router.url_path_for("hls_file", file_path=settings.hls_manifest_filename))


@router.get("/watch", summary="Watch video stream in browser")
async def watch_stream(
    request: Request,
    api_key: Annotated[str, Security(verify_request)],
    camera_manager: CameraManagerDependency,
) -> HTMLResponse:
    """Redirect to appropriate stream viewer based on active stream."""
    if camera_manager.stream.mode == StreamMode.YOUTUBE:
        if not camera_manager.stream.youtube_config:
            raise HTTPException(400, "No broadcast key provided for YouTube stream")
        return templates.TemplateResponse(
            "youtube_stream_viewer.html", {"broadcast_key": camera_manager.stream.youtube_config.broadcast_key}
        )
    # Default to local stream viewer if no stream active
    response = templates.TemplateResponse("local_stream_viewer.html")
    response.set_cookie(key="X-API-Key", value=api_key, httponly=True, secure=True, samesite="lax")
    return response


@router.delete("/stop", status_code=204, summary="Stop streaming video")
async def stop_stream(
    camera_manager: CameraManagerDependency,
    mode: Annotated[StreamMode | None, Query(description="Streaming mode (youtube or local)", example="local")] = None,
) -> None:
    """Stop any active stream. If the mode is specified, only stop that stream."""
    if not camera_manager.stream.is_active:
        raise HTTPException(404, "No stream active")
    if mode and camera_manager.stream.mode != mode:
        raise HTTPException(404, f"No {mode.value} stream active")
    try:
        return await camera_manager.stop_streaming()
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
