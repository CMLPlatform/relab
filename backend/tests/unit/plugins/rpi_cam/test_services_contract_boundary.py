"""Tests for backend ownership of plugin streaming workflow schemas."""

from app.api.plugins.rpi_cam.schemas.streaming import YoutubeStreamConfig
from app.api.plugins.rpi_cam.services import YoutubeStreamConfigWithID


def test_youtube_stream_config_stays_backend_local() -> None:
    """Backend orchestration schemas should not come from the shared contract package."""
    assert YoutubeStreamConfig.__module__ == "app.api.plugins.rpi_cam.schemas.streaming"
    assert YoutubeStreamConfigWithID.__mro__[1] is YoutubeStreamConfig
