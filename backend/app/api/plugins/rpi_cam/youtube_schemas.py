"""Pydantic models for YouTube API requests and responses."""

from pydantic import BaseModel, ConfigDict, Field


# ruff: noqa: N815 # PascalCase field names match YouTube API conventions; ignore snake_case naming violation
class YouTubeSnippetCreate(BaseModel):
    """Common YouTube snippet payload."""

    title: str
    description: str = ""
    scheduledStartTime: str | None = None


class YouTubeBroadcastStatusCreate(BaseModel):
    """Broadcast status payload."""

    privacyStatus: str
    selfDeclaredMadeForKids: bool = False


class YouTubeBroadcastContentDetailsCreate(BaseModel):
    """Broadcast content details payload."""

    enableAutoStart: bool = True
    enableAutoStop: bool = True


class YouTubeBroadcastCreateRequest(BaseModel):
    """Create-live-broadcast request payload."""

    snippet: YouTubeSnippetCreate
    status: YouTubeBroadcastStatusCreate
    contentDetails: YouTubeBroadcastContentDetailsCreate


class YouTubeStreamCDNCreate(BaseModel):
    """Stream CDN configuration payload."""

    frameRate: str = "30fps"
    ingestionType: str = "hls"
    resolution: str = "720p"


class YouTubeStreamCreateRequest(BaseModel):
    """Create-live-stream request payload."""

    snippet: YouTubeSnippetCreate
    cdn: YouTubeStreamCDNCreate
    description: str = ""


class YouTubeBroadcastResponse(BaseModel):
    """Subset of broadcast response fields used by the app."""

    id: str


class YouTubeMonitorStreamResponse(BaseModel):
    """Subset of monitor stream fields used by the app."""

    enableMonitorStream: bool
    broadcastStreamDelayMs: int | None = None
    embedHtml: str | None = None


class YouTubeBroadcastContentDetailsResponse(BaseModel):
    """Subset of broadcast content details fields used by the app."""

    monitorStream: YouTubeMonitorStreamResponse | None = None


class YouTubeBroadcastItemResponse(BaseModel):
    """Single broadcast item from list response."""

    id: str
    contentDetails: YouTubeBroadcastContentDetailsResponse | None = None


class YouTubeBroadcastListResponse(BaseModel):
    """List-broadcasts response payload."""

    items: list[YouTubeBroadcastItemResponse] = Field(default_factory=list)


class YouTubeIngestionInfoResponse(BaseModel):
    """Subset of ingestion info fields used by the app."""

    streamName: str


class YouTubeCDNResponse(BaseModel):
    """Subset of CDN response fields used by the app."""

    ingestionInfo: YouTubeIngestionInfoResponse


class YouTubeStreamResponse(BaseModel):
    """Subset of stream response fields used by the app."""

    id: str
    cdn: YouTubeCDNResponse


class YouTubeStreamStatusResponse(BaseModel):
    """Subset of stream status response fields used by the app."""

    streamStatus: str


class YouTubeStreamItemResponse(BaseModel):
    """Single stream item from list response."""

    status: YouTubeStreamStatusResponse


class YouTubeStreamListResponse(BaseModel):
    """List-streams response payload."""

    items: list[YouTubeStreamItemResponse] = Field(default_factory=list)


class YouTubeAPIErrorResponseDetail(BaseModel):
    """Error detail object from YouTube API."""

    message: str | None = None


class YouTubeAPIErrorResponse(BaseModel):
    """Error response payload from YouTube API."""

    model_config = ConfigDict(extra="ignore")

    error: YouTubeAPIErrorResponseDetail | None = None
