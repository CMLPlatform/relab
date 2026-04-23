"""WebSocket message protocol for the RPi camera relay."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from relab_rpi_cam_models import RelayCommandEnvelope, RelayMessageType

# Message type sent backend → RPi
MSG_REQUEST = RelayMessageType.REQUEST
# Message type sent RPi → backend
MSG_RESPONSE = RelayMessageType.RESPONSE
# Heartbeat messages (bidirectional)
MSG_PING = RelayMessageType.PING
MSG_PONG = RelayMessageType.PONG


def build_command(
    msg_id: str,
    method: str,
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> str:
    """Serialise a command message to send to the RPi."""
    return RelayCommandEnvelope(
        id=msg_id,
        method=method,
        path=path,
        params=params or {},
        body=body,
        headers=headers or {},
    ).model_dump_json()


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
