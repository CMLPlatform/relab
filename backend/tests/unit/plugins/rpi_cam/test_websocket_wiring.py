"""Contract tests for how the camera relay endpoint is reached.

The handler's own decisions are tested in ``test_websocket_router.py`` against a
mock socket. What that cannot see is the wiring every deployed Pi depends on: the
URL it dials and the query parameter it puts the camera id in. Renaming either
would leave those tests green and take every camera in the field offline, so this
module drives a real ASGI websocket scope through the app instead.
"""

from typing import TYPE_CHECKING
from urllib.parse import urlsplit
from uuid import uuid4

from app.api.plugins.rpi_cam.routers.pairing import _build_ws_url
from app.main import app

if TYPE_CHECKING:
    from uuid import UUID

# Deliberate literals, not imports: a paired camera persists the absolute URL it was
# handed, so renaming the route strands the whole fleet until each one re-pairs. These
# must fail and be updated knowingly rather than track the constants they mirror.
RELAY_WS_PATH = "/v1/plugins/rpi-cam/ws/connect"
CAMERA_ID_QUERY_PARAM = "camera_id"
_WS_POLICY_VIOLATION = 1008


async def _drive_handshake(path: str, query: str) -> list[dict]:
    """Open a websocket scope against the real app and return what it sent back."""
    sent: list[dict] = []

    async def receive() -> dict:
        return {"type": "websocket.connect"}

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "scheme": "ws",
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "root_path": "",
        # A browser origin is refused first thing, so the handshake stops before any
        # database or Redis work while still proving the endpoint was reached.
        "headers": [(b"host", b"test"), (b"origin", b"https://evil.example")],
        "client": ("203.0.113.10", 1234),
        "server": ("test", 80),
        "subprotocols": [],
        "state": {},
    }
    await app(scope, receive, send)
    return sent


def _camera_id() -> UUID:
    return uuid4()


async def test_the_relay_endpoint_is_reachable_at_its_published_url() -> None:
    """A Pi dialling the documented URL with a camera id must reach the relay handler."""
    sent = await _drive_handshake(RELAY_WS_PATH, f"{CAMERA_ID_QUERY_PARAM}={_camera_id()}")

    assert sent == [
        {
            "type": "websocket.close",
            "code": _WS_POLICY_VIOLATION,
            "reason": "Browser-origin WebSocket clients are not allowed.",
        }
    ]


async def test_a_handshake_without_a_camera_id_never_reaches_the_handler() -> None:
    """The camera id is required, so a malformed dial is rejected by validation."""
    sent = await _drive_handshake(RELAY_WS_PATH, "")

    assert sent, "the handshake produced no response at all"
    assert sent[0]["type"] == "websocket.close"
    assert sent[0].get("reason") != "Browser-origin WebSocket clients are not allowed."


async def test_an_unknown_websocket_path_is_not_served() -> None:
    """Proves the path assertion above is load-bearing rather than matching anything."""
    sent = await _drive_handshake(f"{RELAY_WS_PATH}-typo", f"{CAMERA_ID_QUERY_PARAM}={_camera_id()}")

    assert sent == [{"type": "websocket.close", "code": 1000, "reason": ""}]


async def test_pairing_hands_cameras_a_url_that_actually_resolves() -> None:
    """The URL pairing advertises must reach the relay, not merely look plausible.

    A camera persists this URL and dials it for the rest of its life, so an advertised
    path that no longer matches the mounted route strands every newly paired device
    while the backend still looks healthy.
    """
    advertised = urlsplit(_build_ws_url())

    sent = await _drive_handshake(advertised.path, f"{CAMERA_ID_QUERY_PARAM}={_camera_id()}")

    assert sent == [
        {
            "type": "websocket.close",
            "code": _WS_POLICY_VIOLATION,
            "reason": "Browser-origin WebSocket clients are not allowed.",
        }
    ], f"pairing advertises {advertised.path}, which does not reach the relay endpoint"
