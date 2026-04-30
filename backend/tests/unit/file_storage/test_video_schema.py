"""Tests for video DTO validation."""
# spell-checker: ignore renderable

import pytest
from pydantic import ValidationError

from app.api.file_storage.schemas import VideoCreate, VideoCreateWithinProduct, VideoUpdateWithinProduct


@pytest.mark.parametrize("url", ["http://example.com/video.mp4", "https://example.com/watch?v=abc"])
def test_video_create_accepts_http_urls(url: str) -> None:
    """Video creation accepts browser-renderable HTTP(S) URLs."""
    video = VideoCreate.model_validate({"url": url, "title": "Demo", "description": "", "product_id": 1})

    assert str(video.url) == url


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://example.com/video"]
)
def test_video_create_rejects_non_http_urls(url: str) -> None:
    """Video creation rejects schemes that should not be rendered or opened."""
    with pytest.raises(ValidationError):
        VideoCreateWithinProduct.model_validate({"url": url, "title": "Demo", "description": ""})


def test_video_update_rejects_non_http_url() -> None:
    """Video updates keep the same HTTP(S)-only URL boundary."""
    with pytest.raises(ValidationError):
        VideoUpdateWithinProduct.model_validate({"url": "file:///tmp/video.mp4"})
