"""Typing helpers for the RPi camera plugin.

Minimal protocols for the YouTube API client, which lacks type annotations.
Based on the YouTube v3 API discovery document.
See: https://github.com/googleapis/google-api-python-client/blob/main/googleapiclient/discovery_cache/documents/youtube.v3.json
"""

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from collections.abc import Mapping


class YouTubeRequest(Protocol):
    """Minimal request protocol that matches googleapiclient request objects."""

    def execute(self) -> dict[str, Any]:
        """Execute the request and return the JSON response."""
        ...


class LiveBroadcastsResource(Protocol):
    """Protocol for the liveBroadcasts resource from the YouTube v3 schema."""

    def insert(self, *, part: str, body: Mapping[str, Any]) -> YouTubeRequest:
        """Insert a new broadcast for the authenticated user."""
        ...

    def bind(self, *, id: str, part: str, streamId: str) -> YouTubeRequest:  # noqa: A002, N803 # id is required by API and cannot be renamed, streamId matches YouTube API resource argument
        """Bind a broadcast to a stream."""
        ...

    def delete(self, *, id: str) -> YouTubeRequest:  # noqa: A002 # id is required by API and cannot be renamed
        """Delete a broadcast."""
        ...


class LiveStreamsResource(Protocol):
    """Protocol for the liveStreams resource from the YouTube v3 schema."""

    def insert(self, *, part: str, body: Mapping[str, Any]) -> YouTubeRequest:
        """Insert a new stream for the authenticated user."""
        ...

    def list(self, *, part: str, id: str) -> YouTubeRequest:  # noqa: A002 # id is required by API and cannot be renamed
        """Retrieve streams by ID for the authenticated user."""
        ...


class YouTubeResource(Protocol):
    """Minimal protocol for the YouTube client based on the v3 schema."""

    def liveBroadcasts(self) -> LiveBroadcastsResource:  # noqa: N802 # Method name matches YouTube API resource name
        """Access liveBroadcasts methods."""
        ...

    def liveStreams(self) -> LiveStreamsResource:  # noqa: N802 # Method name matches YouTube API resource name
        """Access liveStreams methods."""
        ...
