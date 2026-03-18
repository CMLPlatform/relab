"""Unit tests for custom configuration logic.

Tests custom validation, computed fields, and mode-based configuration.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import Any

import pytest
from pydantic import BaseModel, Field, ValidationError, computed_field

from app.core.config import CoreSettings, Environment

# Constants for test values to avoid magic value warnings
USER_PW = "MyPassword123"  # pragma: allowlist secret
SHORT_PW = "short"  # pragma: allowlist secret
NO_UPPER_PW = "mypassword123"  # pragma: allowlist secret


@pytest.mark.unit
class TestCustomConfigurationLogic:
    """Test custom configuration validation and computed fields."""

    def test_computed_fields(self) -> None:
        """Test custom computed/derived fields."""

        class UrlConfig(BaseModel):
            """Configuration with computed URL field."""

            protocol: str = "https"
            host: str
            port: int = 443

            @computed_field
            @property
            def url(self) -> str:
                """Compute full URL from components."""
                return f"{self.protocol}://{self.host}:{self.port}"

        # Test default protocol and port
        config = UrlConfig(host="example.com")
        assert config.url == "https://example.com:443"  # noqa: PLR2004

        # Test custom values
        config2 = UrlConfig(protocol="http", host="localhost", port=8000)
        assert config2.url == "http://localhost:8000"  # noqa: PLR2004

    def test_custom_validation_in_init(self) -> None:
        """Test custom validation logic in __init__ method."""
        error_msg = "Password must contain uppercase letter"

        class PasswordConfig(BaseModel):
            """Configuration with custom password validation."""

            password: str = Field(min_length=8)

            def __init__(self, **data: Any) -> None:  # noqa: ANN401
                super().__init__(**data)
                # Custom validation beyond Pydantic's constraints
                if not any(c.isupper() for c in self.password):
                    raise ValueError(error_msg)

        # Valid password with uppercase
        config = PasswordConfig(password=USER_PW)
        assert config.password == USER_PW

        # Pydantic constraint fails (too short)
        with pytest.raises(ValidationError):
            PasswordConfig(password=SHORT_PW)

        # Custom validation fails (no uppercase)
        with pytest.raises(ValueError, match="uppercase"):
            PasswordConfig(password=NO_UPPER_PW)

    def test_mode_based_configuration(self) -> None:
        """Test custom logic that auto-configures based on mode."""
        mode_dev = "development"
        mode_prod = "production"

        class ModeConfig(BaseModel):
            """Configuration with mode-dependent behavior."""

            mode: str = mode_dev
            debug: bool = False

            def __init__(self, **data: Any) -> None:  # noqa: ANN401
                super().__init__(**data)
                # Auto-configure debug based on mode
                if self.mode == mode_dev:
                    self.debug = True
                elif self.mode == mode_prod:
                    self.debug = False

        # Development mode auto-enables debug
        dev_config = ModeConfig(mode=mode_dev)
        assert dev_config.debug is True

        # Production mode keeps debug off
        prod_config = ModeConfig(mode=mode_prod)
        assert prod_config.debug is False

    def test_multi_field_validation(self) -> None:
        """Test custom validation across multiple fields."""

        class ConnectionConfig(BaseModel):
            """Configuration with cross-field validation."""

            min_connections: int
            max_connections: int

            def __init__(self, **data: Any) -> None:  # noqa: ANN401
                super().__init__(**data)
                # Custom cross-field validation
                if self.min_connections > self.max_connections:
                    msg = "min_connections cannot be greater than max_connections"
                    raise ValueError(msg)

        # Valid configuration
        config = ConnectionConfig(min_connections=5, max_connections=20)
        assert config.min_connections == 5
        assert config.max_connections == 20

        # Invalid config: min > max
        with pytest.raises(ValueError, match="min_connections cannot be greater"):
            ConnectionConfig(min_connections=20, max_connections=5)


@pytest.mark.unit
class TestCoreSettingsCors:
    """Test CORS configuration behavior in CoreSettings."""

    def test_allowed_origins_dev_is_wildcard(self) -> None:
        """DEV environment should allow all origins."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.allowed_origins == ["*"]

    def test_allowed_origins_staging_are_normalized(self) -> None:
        """Staging origins should match browser Origin format (no trailing slash)."""
        settings = CoreSettings(
            environment=Environment.STAGING,
            frontend_web_url="https://web-test.cml-relab.org/",
            frontend_app_url="https://app-test.cml-relab.org/",
        )

        assert settings.allowed_origins == [
            "https://web-test.cml-relab.org",
            "https://app-test.cml-relab.org",
        ]

    def test_allowed_hosts_dev_defaults(self) -> None:
        """DEV environment should trust only local hostnames."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.allowed_hosts == ["127.0.0.1", "localhost"]

    def test_allowed_hosts_derive_from_backend_api_url(self) -> None:
        """Trusted hosts should derive from backend_api_url in non-DEV environments."""
        settings = CoreSettings(
            environment=Environment.STAGING,
            backend_api_url="https://api-test.cml-relab.org",
        )

        assert settings.allowed_hosts == [
            "api-test.cml-relab.org",
            "127.0.0.1",
            "localhost",
        ]
