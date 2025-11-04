"""Configuration for the auth module."""

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Set the project base directory and .env file
BASE_DIR: Path = (Path(__file__).parents[3]).resolve()


class AuthSettings(BaseSettings):
    """Settings class to store settings related to auth components."""

    # Authentication settings
    fastapi_users_secret: str = ""
    newsletter_secret: str = ""

    # OAuth settings
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""

    # Settings used to configure the email server for sending emails from the app.
    email_host: str = ""
    email_port: int = 587  # Default SMTP port for TLS
    email_username: str = ""
    email_password: SecretStr = SecretStr("")
    email_from: str = ""
    email_reply_to: str = ""

    # Initialize the settings configuration from the .env file (or direct environment variables in Docker)
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # Set default values for email settings if not provided
    if not email_from:
        email_from = email_username
    if not email_reply_to:
        email_reply_to = email_username

    # Time to live for access (login) and verification tokens
    access_token_ttl_seconds: int = 60 * 60 * 3  # 3 hours
    reset_password_token_ttl_seconds: int = 60 * 60  # 1 hour
    verification_token_ttl_seconds: int = 60 * 60 * 24  # 1 day
    newsletter_unsubscription_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 7 days

    # Youtube API settings
    youtube_api_scopes: list[str] = [
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.force-ssl",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
    ]


# Create a settings instance that can be imported throughout the app
settings = AuthSettings()
