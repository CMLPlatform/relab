"""Pydantic models for YouTube API requests and responses."""

from pydantic import BaseModel, ConfigDict, Field


class YouTubeSnippetCreate(BaseModel):
    """Common YouTube snippet payload."""

    title: str
    description: str = ""
    scheduledStartTime: str | None = None  # noqa: N815 # Matches YouTube API field name


class YouTubeBroadcastStatusCreate(BaseModel):
    """Broadcast status payload."""

    privacyStatus: str  # noqa: N815 # Matches YouTube API field name
    selfDeclaredMadeForKids: bool = False  # noqa: N815 # Matches YouTube API field name


class YouTubeBroadcastContentDetailsCreate(BaseModel):
    """Broadcast content details payload."""

    enableAutoStart: bool = True  # noqa: N815 # Matches YouTube API field name
    enableAutoStop: bool = True  # noqa: N815 # Matches YouTube API field name


class YouTubeBroadcastCreateRequest(BaseModel):
    """Create-live-broadcast request payload."""

    snippet: YouTubeSnippetCreate
    status: YouTubeBroadcastStatusCreate
    contentDetails: YouTubeBroadcastContentDetailsCreate  # noqa: N815 # Matches YouTube API field name


class YouTubeStreamCDNCreate(BaseModel):
    """Stream CDN configuration payload."""

    frameRate: str = "30fps"  # noqa: N815 # Matches YouTube API field name
    ingestionType: str = "hls"  # noqa: N815 # Matches YouTube API field name
    resolution: str = "720p"


class YouTubeStreamCreateRequest(BaseModel):
    """Create-live-stream request payload."""

    snippet: YouTubeSnippetCreate
    cdn: YouTubeStreamCDNCreate
    description: str = ""


class YouTubeBroadcastResponse(BaseModel):
    """Subset of broadcast response fields used by the app."""

    id: str


class YouTubeIngestionInfoResponse(BaseModel):
    """Subset of ingestion info fields used by the app."""

    streamName: str  # noqa: N815 # Matches YouTube API field name


class YouTubeCDNResponse(BaseModel):
    """Subset of CDN response fields used by the app."""

    ingestionInfo: YouTubeIngestionInfoResponse  # noqa: N815 # Matches YouTube API field name


class YouTubeStreamResponse(BaseModel):
    """Subset of stream response fields used by the app."""

    id: str
    cdn: YouTubeCDNResponse


class YouTubeStreamStatusResponse(BaseModel):
    """Subset of stream status response fields used by the app."""

    streamStatus: str  # noqa: N815 # Matches YouTube API field name


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
