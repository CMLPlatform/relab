"""Unit tests for the Raspberry Pi Camera plugin configuration."""

import pytest

from app.api.plugins.rpi_cam.config import RPiCamSettings


@pytest.mark.unit
class TestRPiCamSettingsDefaults:
    """RPiCamSettings should produce safe defaults when no env file is present."""

    def test_plugin_secret_accepts_empty_value(self) -> None:
        """Plugin secret can be explicitly set to empty string (safe for dev)."""
        settings = RPiCamSettings(rpi_cam_plugin_secret="")
        assert settings.rpi_cam_plugin_secret == ""


@pytest.mark.unit
class TestRPiCamSettingsOverrides:
    """RPiCamSettings should accept constructor-level overrides."""

    def test_plugin_secret_can_be_set(self) -> None:
        """A Fernet key supplied via constructor is stored correctly."""
        # Valid 32-byte URL-safe base64 Fernet key (test-only, not used for real encryption)
        fernet_key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        settings = RPiCamSettings(rpi_cam_plugin_secret=fernet_key)
        assert settings.rpi_cam_plugin_secret == fernet_key
