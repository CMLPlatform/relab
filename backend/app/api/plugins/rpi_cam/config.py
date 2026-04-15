"""Configuration for the Raspberry Pi Camera plugin."""

from cryptography.fernet import Fernet
from pydantic import model_validator

from app.core.config.models import Environment
from app.core.env import RelabBaseSettings


class RPiCamSettings(RelabBaseSettings):
    """Settings class to store settings related to the Raspberry Pi Camera plugin."""

    environment: Environment = Environment.DEV
    rpi_cam_plugin_secret: str = ""

    @model_validator(mode="after")
    def validate_plugin_secret(self) -> RPiCamSettings:
        """Require a valid Fernet key whenever the plugin may be active."""
        if self.rpi_cam_plugin_secret:
            Fernet(self.rpi_cam_plugin_secret.encode())
            return self

        if self.environment in (Environment.STAGING, Environment.PROD):
            msg = "RPI_CAM_PLUGIN_SECRET must not be empty in production/staging"
            raise ValueError(msg)

        return self


settings = RPiCamSettings()
