"""Configuration for the Raspberry Pi Camera plugin."""

from app.core.env import RelabBaseSettings


class RPiCamSettings(RelabBaseSettings):
    """Settings class to store settings related to the Raspberry Pi Camera plugin."""

    # Reserved for future plugin-wide settings.
    rpi_cam_plugin_secret: str = ""


settings = RPiCamSettings()
