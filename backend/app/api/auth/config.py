"""Configuration for the auth module."""

from dataclasses import dataclass
from functools import cached_property

from pydantic import EmailStr, Field, NameEmail, SecretStr, TypeAdapter, model_validator

from app.core.config.models import Environment
from app.core.constants import DAY, HOUR, MINUTE, MONTH
from app.core.env import RelabBaseSettings, is_production_like_environment

NAME_EMAIL_ADAPTER = TypeAdapter(NameEmail)


def parse_name_email(value: str, *, fallback: str = "") -> NameEmail | None:
    """Parse a configured email string, optionally falling back to another value."""
    raw_value = value.strip() or fallback.strip()
    if not raw_value:
        return None
    return NAME_EMAIL_ADAPTER.validate_python(raw_value)


@dataclass(frozen=True, slots=True)
class ResolvedEmailSettings:
    """Resolved auth email settings shared by email utilities."""

    username: str
    password: SecretStr
    host: str
    port: int
    sender: NameEmail | None
    reply_to: NameEmail | None

    def recipient(self, email: EmailStr | str) -> NameEmail:
        """Return a parsed recipient address."""
        return NAME_EMAIL_ADAPTER.validate_python(str(email))


class AuthSettings(RelabBaseSettings):
    """Settings class to store settings related to auth components."""

    environment: Environment = Environment.DEV

    # Authentication settings
    fastapi_users_secret: SecretStr = SecretStr("")
    newsletter_secret: SecretStr = SecretStr("")

    # OAuth settings
    google_oauth_client_id: SecretStr = SecretStr("")
    google_oauth_client_secret: SecretStr = SecretStr("")
    github_oauth_client_id: SecretStr = SecretStr("")
    github_oauth_client_secret: SecretStr = SecretStr("")

    # OAuth frontend redirect hardening
    # NOTE: Origin validation reuses the same normalized frontend URLs and dev-only regex as CORS.

    # Optional path allowlist. When empty, any path on an allowed origin is accepted.
    oauth_allowed_redirect_paths: list[str] = Field(default_factory=list)
    # Optional exact allowlist for native deep-link callbacks (scheme://host/path, no query/fragment).
    oauth_allowed_native_redirect_uris: list[str] = Field(default_factory=list)

    # Settings used to configure the email server for sending emails from the app.
    email_host: str = ""
    email_port: int = 587  # Default SMTP port for TLS
    email_username: str = ""
    email_password: SecretStr = SecretStr("")
    email_from: str = ""
    email_reply_to: str = ""

    # Time to live for access (login) and verification tokens
    access_token_ttl_seconds: int = 15 * MINUTE  # 15 minutes (Redis token lifetime)
    oauth_state_token_ttl_seconds: int = 10 * MINUTE  # 10 minutes
    reset_password_token_ttl_seconds: int = HOUR  # 1 hour
    verification_token_ttl_seconds: int = DAY  # 1 day
    newsletter_unsubscription_token_ttl_seconds: int = MONTH  # 30 days

    # Auth settings - Refresh tokens and sessions
    refresh_token_expire_days: int = 30  # 30 days for long-lived refresh tokens
    session_id_length: int = 32

    # Auth settings - Rate limiting
    rate_limit_login_attempts_per_minute: int = 3
    rate_limit_register_attempts_per_hour: int = 5
    rate_limit_verify_attempts_per_hour: int = 3
    rate_limit_password_reset_attempts_per_hour: int = 3

    # Youtube API settings
    youtube_api_scopes: list[str] = Field(
        default_factory=lambda: [
            "https://www.googleapis.com/auth/youtube",
            "https://www.googleapis.com/auth/youtube.force-ssl",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
        ]
    )

    @cached_property
    def email(self) -> ResolvedEmailSettings:
        """Return resolved email settings with shared fallback logic applied once."""
        sender = parse_name_email(self.email_from, fallback=self.email_username)
        return ResolvedEmailSettings(
            username=self.email_username,
            password=self.email_password,
            host=self.email_host,
            port=self.email_port,
            sender=sender,
            reply_to=parse_name_email(self.email_reply_to, fallback=self.email_from or self.email_username) or sender,
        )

    @model_validator(mode="after")
    def validate_production_auth_settings(self) -> "AuthSettings":
        """Fail fast when production-like auth settings are incomplete."""
        if not is_production_like_environment(self.environment.value):
            return self

        errors: list[str] = []
        required_secrets = {
            "FASTAPI_USERS_SECRET": self.fastapi_users_secret.get_secret_value(),
            "NEWSLETTER_SECRET": self.newsletter_secret.get_secret_value(),
            "GOOGLE_OAUTH_CLIENT_ID": self.google_oauth_client_id.get_secret_value(),
            "GOOGLE_OAUTH_CLIENT_SECRET": self.google_oauth_client_secret.get_secret_value(),
            "GITHUB_OAUTH_CLIENT_ID": self.github_oauth_client_id.get_secret_value(),
            "GITHUB_OAUTH_CLIENT_SECRET": self.github_oauth_client_secret.get_secret_value(),
            "EMAIL_PASSWORD": self.email_password.get_secret_value(),
        }
        required_strings = {
            "EMAIL_HOST": self.email_host,
            "EMAIL_USERNAME": self.email_username,
            "EMAIL_FROM": self.email_from,
            "EMAIL_REPLY_TO": self.email_reply_to,
        }

        for name, value in required_secrets.items():
            if not value:
                errors.append(f"{name} must not be empty in production/staging")

        for name, value in required_strings.items():
            if not value:
                errors.append(f"{name} must not be empty in production/staging")

        if errors:
            formatted = "\n  - ".join(errors)
            raise ValueError(f"Auth settings validation failed:\n  - {formatted}")

        return self


# Create a settings instance that can be imported throughout the app
settings = AuthSettings()
