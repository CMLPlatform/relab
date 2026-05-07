"""Configuration for the auth module."""

from dataclasses import dataclass
from enum import StrEnum
from functools import cached_property
from urllib.parse import urlparse, urlunparse

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    HttpUrl,
    NameEmail,
    SecretStr,
    TypeAdapter,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.core.config.models import Environment
from app.core.constants import DAY, HOUR, MINUTE
from app.core.env import RelabBaseSettings, is_production_like_environment
from app.core.secrets import validate_min_secret_bytes

NAME_EMAIL_ADAPTER = TypeAdapter(NameEmail)
FRONTEND_OAUTH_REDIRECT_PATHS = ("/login", "/profile")
NATIVE_OAUTH_REDIRECT_URIS = ("relab-app://login", "relab-app://profile")
OAUTH_ALLOWED_REDIRECT_URIS_FIELD = "oauth_allowed_redirect_uris"


def normalize_oauth_redirect_uri(value: str) -> str:
    """Normalize an OAuth redirect target to scheme://host/path."""
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        msg = "OAuth redirect URIs must be absolute targets without credentials, query, or fragment"
        raise ValueError(msg)
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", "", "")).rstrip("/")


class EmailProviderName(StrEnum):
    """Supported email delivery providers."""

    SMTP = "smtp"
    MICROSOFT_GRAPH = "microsoft_graph"


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


class GraphEmailSettings(BaseModel):
    """Microsoft Graph email provider settings."""

    tenant_id: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    client_secret: SecretStr
    sender_user: str = Field(min_length=1)
    save_to_sent_items: bool = False

    @field_validator("client_secret")
    @classmethod
    def validate_client_secret(cls, value: SecretStr) -> SecretStr:
        """Reject empty Graph client secrets."""
        if not value.get_secret_value():
            msg = "Microsoft Graph client secret must not be empty"
            raise ValueError(msg)
        return value


class AuthSettings(RelabBaseSettings):
    """Settings class to store settings related to auth components."""

    environment: Environment = Environment.DEV

    # Authentication settings
    auth_token_secret: SecretStr = SecretStr("")

    # OAuth settings
    oauth_state_secret: SecretStr = SecretStr("")
    google_oauth_client_id: SecretStr = SecretStr("")
    google_oauth_client_secret: SecretStr = SecretStr("")
    github_oauth_client_id: SecretStr = SecretStr("")
    github_oauth_client_secret: SecretStr = SecretStr("")
    frontend_app_url: HttpUrl = HttpUrl("http://127.0.0.1:8003")

    # OAuth frontend redirect hardening: exact normalized callback targets only.
    oauth_allowed_redirect_uris: list[str] = Field(default_factory=list)

    # Settings used to configure the email server for sending emails from the app.
    email_provider: EmailProviderName = EmailProviderName.SMTP
    smtp_host: str = ""
    smtp_port: int = 587  # Default SMTP port for TLS
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    email_from: str = ""
    email_reply_to: str = ""

    # Microsoft Graph email provider settings.
    microsoft_graph_tenant_id: str = ""
    microsoft_graph_client_id: str = ""
    microsoft_graph_client_secret: SecretStr = SecretStr("")
    microsoft_graph_sender_user: str = ""
    microsoft_graph_save_to_sent_items: bool = False

    # Time to live for access (login) and verification tokens
    access_token_ttl_seconds: int = 15 * MINUTE  # 15 minutes (Redis token lifetime)
    oauth_state_token_ttl_seconds: int = 10 * MINUTE  # 10 minutes
    reset_password_token_ttl_seconds: int = HOUR  # 1 hour
    verification_token_ttl_seconds: int = DAY  # 1 day

    # Auth settings - Refresh tokens and sessions
    refresh_token_expire_days: int = 30  # 30 days for long-lived refresh tokens
    refresh_session_absolute_expire_days: int = 30  # 30 days maximum session lifetime

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

    @field_validator("auth_token_secret")
    @classmethod
    def validate_auth_token_secret(cls, value: SecretStr, info: ValidationInfo) -> SecretStr:
        """Reject too-short auth secrets outside deterministic tests."""
        environment = info.data.get("environment", Environment.DEV)
        if environment == Environment.TESTING:
            return value

        return validate_min_secret_bytes(value, "AUTH_TOKEN_SECRET")

    @field_validator("oauth_allowed_redirect_uris")
    @classmethod
    def normalize_oauth_allowed_redirect_uris(cls, value: list[str]) -> list[str]:
        """Normalize exact OAuth redirect allowlist entries."""
        return [normalize_oauth_redirect_uri(redirect_uri) for redirect_uri in value]

    @model_validator(mode="after")
    def derive_oauth_allowed_redirect_uris(self) -> AuthSettings:
        """Derive OAuth redirect allowlist from the public app origin when omitted."""
        if OAUTH_ALLOWED_REDIRECT_URIS_FIELD in self.model_fields_set:
            return self

        app_origin = str(self.frontend_app_url).rstrip("/")
        web_redirects = [f"{app_origin}{path}" for path in FRONTEND_OAUTH_REDIRECT_PATHS]
        self.oauth_allowed_redirect_uris = [
            *(normalize_oauth_redirect_uri(redirect_uri) for redirect_uri in web_redirects),
            *NATIVE_OAUTH_REDIRECT_URIS,
        ]
        return self

    @cached_property
    def email(self) -> ResolvedEmailSettings:
        """Return resolved email settings with shared fallback logic applied once."""
        sender = parse_name_email(self.email_from, fallback=self.smtp_username)
        return ResolvedEmailSettings(
            username=self.smtp_username,
            password=self.smtp_password,
            host=self.smtp_host,
            port=self.smtp_port,
            sender=sender,
            reply_to=parse_name_email(self.email_reply_to, fallback=self.email_from or self.smtp_username) or sender,
        )

    @cached_property
    def microsoft_graph_email(self) -> GraphEmailSettings:
        """Return validated Microsoft Graph email settings."""
        return GraphEmailSettings(
            tenant_id=self.microsoft_graph_tenant_id,
            client_id=self.microsoft_graph_client_id,
            client_secret=self.microsoft_graph_client_secret,
            sender_user=self.microsoft_graph_sender_user,
            save_to_sent_items=self.microsoft_graph_save_to_sent_items,
        )

    def _validate_oauth_state_secret(self, errors: list[str]) -> None:
        """Collect production OAuth state secret length errors."""
        if not self.oauth_state_secret.get_secret_value():
            return
        try:
            validate_min_secret_bytes(self.oauth_state_secret, "OAUTH_STATE_SECRET")
        except ValueError as exc:
            errors.append(str(exc).removesuffix("."))

    @model_validator(mode="after")
    def validate_production_auth_settings(self) -> AuthSettings:
        """Fail fast when production-like auth settings are incomplete."""
        oauth_state_secret = self.oauth_state_secret.get_secret_value()
        if not is_production_like_environment(self.environment.value):
            if not oauth_state_secret:
                self.oauth_state_secret = self.auth_token_secret
            return self

        errors: list[str] = []
        required_secrets: dict[str, str] = {
            "AUTH_TOKEN_SECRET": self.auth_token_secret.get_secret_value(),
            "OAUTH_STATE_SECRET": oauth_state_secret,
            "GOOGLE_OAUTH_CLIENT_ID": self.google_oauth_client_id.get_secret_value(),
            "GOOGLE_OAUTH_CLIENT_SECRET": self.google_oauth_client_secret.get_secret_value(),
            "GITHUB_OAUTH_CLIENT_ID": self.github_oauth_client_id.get_secret_value(),
            "GITHUB_OAUTH_CLIENT_SECRET": self.github_oauth_client_secret.get_secret_value(),
        }
        required_strings: dict[str, str] = {
            "EMAIL_FROM": self.email_from,
            "EMAIL_REPLY_TO": self.email_reply_to,
        }
        if self.email_provider is EmailProviderName.SMTP:
            required_secrets["SMTP_PASSWORD"] = self.smtp_password.get_secret_value()
            required_strings.update(
                {
                    "SMTP_HOST": self.smtp_host,
                    "SMTP_USERNAME": self.smtp_username,
                }
            )
        else:
            required_secrets["MICROSOFT_GRAPH_CLIENT_SECRET"] = self.microsoft_graph_client_secret.get_secret_value()
            required_strings.update(
                {
                    "MICROSOFT_GRAPH_TENANT_ID": self.microsoft_graph_tenant_id,
                    "MICROSOFT_GRAPH_CLIENT_ID": self.microsoft_graph_client_id,
                    "MICROSOFT_GRAPH_SENDER_USER": self.microsoft_graph_sender_user,
                }
            )

        for name, value in required_secrets.items():
            if not value:
                errors.append(f"{name} must not be empty in production/staging")

        self._validate_oauth_state_secret(errors)

        for name, value in required_strings.items():
            if not value:
                errors.append(f"{name} must not be empty in production/staging")

        if errors:
            formatted = "\n  - ".join(errors)
            msg = f"Auth settings validation failed:\n  - {formatted}"
            raise ValueError(msg)

        return self


# Create a settings instance that can be imported throughout the app
settings = AuthSettings()
