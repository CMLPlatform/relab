"""WebSocket message protocol for the RPi camera relay."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

# Message type sent backend → RPi
MSG_REQUEST = "request"
# Message type sent RPi → backend
MSG_RESPONSE = "response"
# Heartbeat messages (bidirectional)
MSG_PING = "ping"
MSG_PONG = "pong"


def build_command(msg_id: str, method: str, path: str, params: dict | None = None, body: dict | None = None) -> str:
    """Serialise a command message to send to the RPi."""
    return json.dumps(
        {
            "id": msg_id,
            "type": MSG_REQUEST,
            "method": method,
            "path": path,
            "params": params or {},
            "body": body,
        }
    )


@dataclass
class RelayResponse:
    """Mimics the subset of httpx.Response used by camera interaction code."""

    status_code: int
    _json_data: dict | list | None = field(default=None, repr=False)
    _content: bytes = field(default=b"", repr=False)

    def json(self) -> dict | list:
        """Return parsed JSON payload."""
        if self._json_data is not None:
            return self._json_data
        return json.loads(self._content)

    @property
    def content(self) -> bytes:
        """Return raw response bytes."""
        return self._content

    def raise_for_status(self) -> None:
        """No-op — errors are raised by relay.py before returning this object."""
