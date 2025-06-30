"""Configuration for the Raspberry Pi Camera plugin."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Set the project base directory and .env file
BASE_DIR: Path = (Path(__file__).parents[4]).resolve()


class RPiCamSettings(BaseSettings):
    """Settings class to store settings related to the Raspberry Pi Camera plugin."""

    # Authentication settings
    rpi_cam_plugin_secret: str = ""

    # Initialize the settings configuration from the .env file
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    api_key_header_name: str = "X-API-Key"


# Create a settings instance that can be imported throughout the app
settings = RPiCamSettings()
