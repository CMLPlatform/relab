"""Configuration for the auth module."""

from pydantic import Field, SecretStr, model_validator

from app.core.constants import DAY, HOUR, MINUTE, MONTH
from app.core.env import RelabBaseSettings


class AuthSettings(RelabBaseSettings):
    """Settings class to store settings related to auth components."""

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
    reset_password_token_ttl_seconds: int = HOUR  # 1 hour
    verification_token_ttl_seconds: int = DAY  # 1 day
    newsletter_unsubscription_token_ttl_seconds: int = MONTH  # 30 days

    # Auth settings - Refresh tokens and sessions
    refresh_token_expire_days: int = 30  # 30 days for long-lived refresh tokens
    session_id_length: int = 32

    # Auth settings - Rate limiting
    rate_limit_login_attempts: int = 5
    rate_limit_window_seconds: int = 300  # 5 minutes

    # Youtube API settings
    youtube_api_scopes: list[str] = Field(
        default_factory=lambda: [
            "https://www.googleapis.com/auth/youtube",
            "https://www.googleapis.com/auth/youtube.force-ssl",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
        ]
    )

    @model_validator(mode="after")
    def apply_email_defaults(self) -> "AuthSettings":
        """Default sender fields to the SMTP username when omitted."""
        if not self.email_from:
            self.email_from = self.email_username
        if not self.email_reply_to:
            self.email_reply_to = self.email_username
        return self


# Create a settings instance that can be imported throughout the app
settings = AuthSettings()
