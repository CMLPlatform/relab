"""Unit tests for core configuration loading and validation.

Tests configuration defaults, environment variable parsing, and validation.
"""

import pytest
from pydantic import BaseModel, Field, ValidationError


@pytest.mark.unit
class TestConfigurationPatterns:
    """Test patterns for configuration validation."""

    def test_config_with_defaults(self):
        """Test configuration with sensible defaults."""

        class AppConfig(BaseModel):
            """App configuration with defaults."""

            debug: bool = False
            log_level: str = "INFO"
            database_url: str = "sqlite:///app.db"
            max_connections: int = 10

        # Create with defaults
        config = AppConfig()
        assert config.debug is False
        assert config.log_level == "INFO"
        assert config.database_url == "sqlite:///app.db"

    def test_config_override_defaults(self):
        """Test overriding default configuration values."""

        class AppConfig(BaseModel):
            """App configuration."""

            debug: bool = False
            port: int = 8000

        # Override defaults
        config = AppConfig(debug=True, port=9000)
        assert config.debug is True
        assert config.port == 9000

    def test_config_validation_constraints(self):
        """Test configuration validation constraints."""

        class DatabaseConfig(BaseModel):
            """Database configuration with constraints."""

            host: str
            port: int = Field(ge=1, le=65535)  # Port range validation
            min_connections: int = Field(ge=1)
            max_connections: int = Field(ge=1)

        # Valid config
        config = DatabaseConfig(
            host="localhost",
            port=5432,
            min_connections=5,
            max_connections=20,
        )
        assert config.port == 5432

        # Invalid port
        with pytest.raises(ValidationError) as exc_info:
            DatabaseConfig(
                host="localhost",
                port=99999,  # Out of range
                min_connections=1,
                max_connections=10,
            )
        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "port" for e in errors)

    def test_config_required_fields(self):
        """Test that required fields are enforced."""

        class ApiConfig(BaseModel):
            """API configuration with required fields."""

            api_key: str  # Required, no default
            api_secret: str  # Required
            timeout: int = 30  # Optional with default

        # Missing required field
        with pytest.raises(ValidationError) as exc_info:
            ApiConfig(api_key="key123")  # Missing api_secret

        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "api_secret" for e in errors)

    def test_config_optional_fields(self):
        """Test optional fields with None defaults."""

        class OptionalConfig(BaseModel):
            """Configuration with optional fields."""

            required_field: str
            optional_field: str | None = None
            optional_with_default: str | None = "default"

        # Can be created without optional fields
        config = OptionalConfig(required_field="test")
        assert config.optional_field is None
        assert config.optional_with_default == "default"

    def test_config_computed_fields(self):
        """Test computed/derived fields in configuration."""
        from pydantic import computed_field

        class UrlConfig(BaseModel):
            """Configuration with computed URL field."""

            protocol: str = "https"
            host: str
            port: int = 443

            @computed_field
            @property
            def url(self) -> str:
                """Compute full URL."""
                return f"{self.protocol}://{self.host}:{self.port}"

        config = UrlConfig(host="example.com")
        assert config.url == "https://example.com:443"

        config2 = UrlConfig(protocol="http", host="localhost", port=8000)
        assert config2.url == "http://localhost:8000"

    def test_config_field_validation(self):
        """Test custom field validation logic."""

        class PasswordConfig(BaseModel):
            """Configuration with password validation."""

            password: str = Field(min_length=8)

            def __init__(self, **data):
                super().__init__(**data)
                # Custom validation
                if not any(c.isupper() for c in self.password):
                    raise ValueError("Password must contain uppercase letter")

        # Valid password
        config = PasswordConfig(password="MyPassword123")
        assert config.password == "MyPassword123"

        # Too short
        with pytest.raises(ValidationError):
            PasswordConfig(password="short")

        # No uppercase
        with pytest.raises(ValueError, match="uppercase"):
            PasswordConfig(password="mypassword123")

    def test_config_environment_like_parsing(self):
        """Test configuration parsing from dict like environment variables."""

        class EnvConfig(BaseModel):
            """Parse config from environment-like dict."""

            database_url: str
            redis_host: str = "localhost"
            redis_port: int = 6379

        # Simulate environment variable dict
        env_dict = {
            "database_url": "postgresql://user:pass@localhost/db",
            "redis_host": "redis.example.com",
            "redis_port": "6380",  # String in env, should convert to int
        }

        config = EnvConfig(**env_dict)
        assert config.database_url == "postgresql://user:pass@localhost/db"
        assert config.redis_host == "redis.example.com"
        assert config.redis_port == 6380  # Converted to int

    def test_config_mode_validation(self):
        """Test configuration modes (development, staging, production)."""

        class ModeConfig(BaseModel):
            """Configuration based on mode."""

            mode: str = "development"
            debug: bool = False

            def __init__(self, **data):
                super().__init__(**data)
                # Auto-set debug based on mode
                if self.mode == "development":
                    self.debug = True
                elif self.mode == "production":
                    self.debug = False

        dev_config = ModeConfig(mode="development")
        assert dev_config.debug is True

        prod_config = ModeConfig(mode="production")
        assert prod_config.debug is False


@pytest.mark.unit
class TestConfigurationEdgeCases:
    """Test edge cases and error conditions in configuration."""

    def test_config_type_coercion(self):
        """Test automatic type coercion."""

        class TypeConfig(BaseModel):
            count: int
            ratio: float
            enabled: bool

        # String to int
        config = TypeConfig(count="42", ratio="3.14", enabled="true")
        assert config.count == 42
        assert isinstance(config.count, int)
        assert config.ratio == 3.14
        assert config.enabled is True

    def test_config_empty_strings(self):
        """Test handling of empty strings."""

        class StringConfig(BaseModel):
            required_string: str
            optional_string: str | None = None

        # Empty string for required field is allowed (pydantic default)
        config = StringConfig(required_string="")
        assert config.required_string == ""

    def test_config_whitespace_handling(self):
        """Test whitespace handling in configuration."""

        class NameConfig(BaseModel):
            name: str

        # Whitespace is preserved
        config = NameConfig(name="  test  ")
        assert config.name == "  test  "

    def test_config_case_sensitivity(self):
        """Test that config keys are case-sensitive by default."""

        class CaseConfig(BaseModel):
            DatabaseUrl: str

        # Exact case match works
        config = CaseConfig(DatabaseUrl="postgres://localhost")
        assert config.DatabaseUrl == "postgres://localhost"

        # Wrong case fails
        with pytest.raises(ValidationError):
            CaseConfig(databaseUrl="postgres://localhost")

    def test_config_extra_fields_ignored(self):
        """Test behavior with extra fields."""

        class StrictConfig(BaseModel):
            model_config = {"extra": "ignore"}

            name: str

        # Extra fields are silently ignored
        config = StrictConfig(name="test", extra_field="ignored")
        assert config.name == "test"
        assert not hasattr(config, "extra_field")

    def test_config_extra_fields_error(self):
        """Test error on extra fields when configured to forbid."""

        class StrictConfig(BaseModel):
            model_config = {"extra": "forbid"}

            name: str

        # Extra fields cause ValidationError
        with pytest.raises(ValidationError) as exc_info:
            StrictConfig(name="test", extra_field="not allowed")

        errors = exc_info.value.errors()
        assert any(e["type"] == "extra_forbidden" for e in errors)
