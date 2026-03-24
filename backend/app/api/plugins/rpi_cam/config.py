"""Configuration for the Raspberry Pi Camera plugin."""

from app.core.env import RelabBaseSettings


class RPiCamSettings(RelabBaseSettings):
    """Settings class to store settings related to the Raspberry Pi Camera plugin."""

    # Authentication settings
    rpi_cam_plugin_secret: str = ""

    api_key_header_name: str = "X-API-Key"


# Create a settings instance that can be imported throughout the app
settings = RPiCamSettings()
