"""Small response adapter for camera requests served through the relay."""

from __future__ import annotations

import json
from dataclasses import dataclass, field


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
        """No-op; relay errors are raised before returning this object."""
