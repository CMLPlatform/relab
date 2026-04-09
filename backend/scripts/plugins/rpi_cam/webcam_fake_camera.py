"""Pipe your webcam into the RPi camera API shape for local development.

Supports both connection modes:

  HTTP mode (default):
    uv run python scripts/plugins/rpi-cam/webcam_fake_camera.py
    → Starts a local server on :8018 that the backend proxies to.
    → Register camera as Direct HTTP with URL http://localhost:8018

  WebSocket mode:
    uv run python scripts/plugins/rpi-cam/webcam_fake_camera.py ws \
        --backend-url ws://localhost:8000/plugins/rpi-cam/ws/connect \
        --camera-id <uuid> \
        --api-key <key>
    → Connects outbound to the backend WebSocket relay.
    → Register camera as WebSocket in the UI, then copy the credentials.

Requirements:
    uv sync --group fake-camera
"""
# spell-checker: ignore imencode, IMWRITE

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import cv2
import uvicorn
import websockets
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("webcam-fake-camera")

# ── Constants ──────────────────────────────────────────────────────────────────

_MSG_TYPE_PING = "ping"
_MSG_TYPE_REQUEST = "request"

_METHOD_GET = "GET"
_METHOD_POST = "POST"

_PATH_PREVIEW = "/images/preview"
_PATH_IMAGES = "/images"
_PATH_IMAGES_PREFIX = "/images/"

_MODE_WS = "ws"

_FRAME_READ_ERR = "Failed to read frame from webcam"

# ── Thread-safe webcam capture ─────────────────────────────────────────────────


class _CameraState:
    """Mutable container for the shared webcam handle, avoiding module-level globals."""

    camera: cv2.VideoCapture | None = None
    lock = threading.Lock()


def _ensure_camera() -> cv2.VideoCapture:
    """Open the webcam if not already open. Must be called with _CameraState.lock held."""
    if _CameraState.camera is None or not _CameraState.camera.isOpened():
        _CameraState.camera = cv2.VideoCapture(0)
        if not _CameraState.camera.isOpened():
            logger.error("Could not open webcam — is one connected?")
            sys.exit(1)
        logger.info("Webcam opened (device 0)")
    return _CameraState.camera


def grab_frame(*, quality: int = 85) -> bytes:
    """Capture a single JPEG frame from the webcam."""
    with _CameraState.lock:
        cam = _ensure_camera()
        ok, frame = cam.read()
    if not ok:
        raise RuntimeError(_FRAME_READ_ERR)
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes()


def release_camera() -> None:
    """Release the webcam device if open."""
    with _CameraState.lock:
        if _CameraState.camera is not None:
            _CameraState.camera.release()
            _CameraState.camera = None


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP mode — local FastAPI server the backend proxies to
# ═══════════════════════════════════════════════════════════════════════════════


def _create_http_app() -> FastAPI:
    """Build the FastAPI application with all HTTP-mode routes."""
    captured_images: dict[str, bytes] = {}

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        grab_frame()  # fail fast if no webcam
        logger.info("Webcam ready")
        yield
        release_camera()

    app = FastAPI(title="Webcam Fake RPi Camera (HTTP)", lifespan=lifespan)

    @app.get("/images/preview")
    async def preview() -> Response:
        loop = asyncio.get_running_loop()
        jpeg = await loop.run_in_executor(None, lambda: grab_frame(quality=70))
        return Response(content=jpeg, media_type="image/jpeg")

    @app.post("/images")
    async def capture() -> JSONResponse:
        loop = asyncio.get_running_loop()
        jpeg = await loop.run_in_executor(None, lambda: grab_frame(quality=92))
        image_id = str(uuid.uuid4())
        captured_images[image_id] = jpeg
        data = {
            "image_url": f"/images/{image_id}",
            "metadata": {
                "image_properties": {
                    "capture_time": datetime.now(UTC).isoformat(),
                    "resolution": {"width": 1920, "height": 1080},
                }
            },
        }
        logger.info("Captured image %s (%d bytes)", image_id[:8], len(jpeg))
        return JSONResponse(content=data)

    @app.get("/images/{image_id}")
    async def get_image(image_id: str) -> Response:
        jpeg = captured_images.pop(image_id, None)
        if jpeg is None:
            raise HTTPException(404, "Image not found or already retrieved")
        return Response(content=jpeg, media_type="image/jpeg")

    @app.get("/camera/status")
    async def health() -> JSONResponse:
        return JSONResponse(content={"status": "ok"})

    return app


def run_http(port: int, host: str = "127.0.0.1") -> None:
    """Start the local HTTP fake camera server."""
    app = _create_http_app()
    logger.info("Starting HTTP fake camera on http://%s:%d", host, port)
    logger.info("Register as Direct HTTP camera with URL: http://localhost:%d", port)
    uvicorn.run(app, host=host, port=port)


# ═══════════════════════════════════════════════════════════════════════════════
# WebSocket mode — connects outbound to the backend relay
# ═══════════════════════════════════════════════════════════════════════════════

_ws_captured_images: dict[str, bytes] = {}


def run_websocket(backend_url: str, camera_id: str, api_key: str) -> None:
    """Start the WebSocket fake camera client."""
    asyncio.run(_ws_main(backend_url, camera_id, api_key))


async def _ws_main(backend_url: str, camera_id: str, api_key: str) -> None:
    """Connect to the backend relay and handle reconnection."""
    url = f"{backend_url}?camera_id={camera_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    while True:
        try:
            logger.info("Connecting to %s ...", backend_url)
            async with websockets.connect(url, additional_headers=headers) as ws:
                logger.info("Connected — waiting for commands")
                await _ws_loop(ws)
        except (OSError, websockets.exceptions.WebSocketException) as e:
            logger.warning("Disconnected: %s — reconnecting in 3s", e)
        release_camera()
        await asyncio.sleep(3)


async def _ws_loop(ws: websockets.ClientConnection) -> None:
    """Handle incoming commands from the backend relay."""
    async for raw in ws:
        if isinstance(raw, bytes):
            continue  # we don't expect binary from backend

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        msg_type = msg.get("type")

        if msg_type == _MSG_TYPE_PING:
            await ws.send(json.dumps({"type": "pong"}))
            continue

        if msg_type != _MSG_TYPE_REQUEST:
            continue

        msg_id = msg["id"]
        method = msg.get("method", _METHOD_GET).upper()
        path = msg.get("path", "")

        logger.info("← %s %s (id=%s)", method, path, msg_id[:8])

        try:
            await _handle_command(ws, msg_id, method, path)
        except (RuntimeError, KeyError, ValueError, TypeError) as e:
            logger.exception("Error handling %s %s", method, path)
            await ws.send(
                json.dumps(
                    {
                        "id": msg_id,
                        "type": "response",
                        "status": 500,
                        "data": {"detail": str(e)},
                    }
                )
            )


async def _handle_command(ws: websockets.ClientConnection, msg_id: str, method: str, path: str) -> None:
    """Dispatch a relay command and send the response back over WebSocket."""
    loop = asyncio.get_running_loop()

    if method == _METHOD_GET and path == _PATH_PREVIEW:
        jpeg = await loop.run_in_executor(None, lambda: grab_frame(quality=70))
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "response",
                    "status": 200,
                    "has_binary": True,
                    "data": {},
                }
            )
        )
        await ws.send(jpeg)

    elif method == _METHOD_POST and path == _PATH_IMAGES:
        jpeg = await loop.run_in_executor(None, lambda: grab_frame(quality=92))
        image_id = str(uuid.uuid4())
        _ws_captured_images[image_id] = jpeg
        logger.info("Captured image %s (%d bytes)", image_id[:8], len(jpeg))
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "response",
                    "status": 200,
                    "data": {
                        "image_url": f"/images/{image_id}",
                        "metadata": {
                            "image_properties": {
                                "capture_time": datetime.now(UTC).isoformat(),
                                "resolution": {"width": 1920, "height": 1080},
                            }
                        },
                    },
                }
            )
        )

    elif method == _METHOD_GET and path.startswith(_PATH_IMAGES_PREFIX):
        image_id = path.split(_PATH_IMAGES_PREFIX, 1)[1]
        jpeg = _ws_captured_images.pop(image_id, None)
        if jpeg is None:
            jpeg = await loop.run_in_executor(None, lambda: grab_frame(quality=92))
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "response",
                    "status": 200,
                    "has_binary": True,
                    "data": {},
                }
            )
        )
        await ws.send(jpeg)

    elif path in ("/status", "/camera/status"):
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "response",
                    "status": 200,
                    "data": {"status": "ok"},
                }
            )
        )

    else:
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "response",
                    "status": 404,
                    "data": {"detail": f"Unknown: {method} {path}"},
                }
            )
        )


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════


def main() -> None:
    """Parse CLI arguments and run the selected camera mode."""
    parser = argparse.ArgumentParser(
        description="Pipe your webcam into the RPi camera API for dev/testing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  # HTTP mode — backend proxies to this server
  python scripts/webcam_fake_camera.py

  # WebSocket mode — connects to the backend relay
  python scripts/webcam_fake_camera.py ws \\
      --backend-url ws://localhost:8000/plugins/rpi-cam/ws/connect \\
      --camera-id 550e8400-e29b-41d4-a716-446655440000 \\
      --api-key abc123
        """,
    )
    sub = parser.add_subparsers(dest="mode")

    # HTTP (default when no subcommand)
    http_parser = sub.add_parser("http", help="Run local HTTP server (default)")
    http_parser.add_argument("--port", type=int, default=8018, help="Port (default: 8018)")
    http_parser.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")

    # WebSocket
    ws_parser = sub.add_parser("ws", help="Connect to backend via WebSocket relay")
    ws_parser.add_argument("--backend-url", required=True, help="WebSocket URL of the backend relay")
    ws_parser.add_argument("--camera-id", required=True, help="Camera UUID from ReLab")
    ws_parser.add_argument("--api-key", required=True, help="API key from camera registration")

    args = parser.parse_args()

    if args.mode == _MODE_WS:
        run_websocket(args.backend_url, args.camera_id, args.api_key)
    else:
        port = getattr(args, "port", 8018)
        host = getattr(args, "host", "127.0.0.1")
        run_http(port, host)


if __name__ == "__main__":
    main()
