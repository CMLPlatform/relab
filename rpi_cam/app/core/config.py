"""Configuration settings for the Raspberry Pi API app."""

from pathlib import Path

from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

# Set the project base directory and .env file
BASE_DIR: Path = (Path(__file__).resolve().parent.parent.parent).resolve()


class Settings(BaseSettings):
    """Settings class to store all the configurations for the app."""

    base_url: HttpUrl = HttpUrl("http://127.0.0.1:8018/")  # Base URL for the Raspberry Pi server
    allowed_cors_origins: list[HttpUrl] = [  # Allowed origins for CORS. Must include the main API host
        HttpUrl("http://127.0.0.1:8000"),
        HttpUrl("http://localhost:8000"),
        HttpUrl("https://cml-relab.org"),
    ]
    authorized_api_keys: list[str] = []  # API keys from users of the main API

    # Initialize the settings configuration from the .env file
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env")

    # Directory paths
    hls_path: Path = BASE_DIR / "data" / "hls"  # Used for storing temporary HLS video files
    image_path: Path = BASE_DIR / "data" / "images"  # Used for temporary storing of captured images
    templates_path: Path = BASE_DIR / "app" / "templates"  # Used for storing HTML templates

    # HLS settings
    hls_manifest_filename = "master.m3u8"

    # Directory cleanup settings
    cleanup_interval_s: int = 60 * 10  # Interval for cleaning up expired files in seconds (10 minutes)
    hls_ttl_s: int = 60  # Time-to-live for HLS video files in seconds (1 minute)
    image_ttl_s: int = 60 * 60  # Time-to-live for captured images in seconds (1 hour)
    max_stream_duration_s: int = 60 * 60 * 5  # Maximum duration for a stream in seconds (5 hours)

    # Camera settings
    camera_standby_s: int = 60 * 10  # Camera standby time in seconds (10 minutes)


# Create a settings instance that can be imported throughout the app
settings: Settings = Settings()
