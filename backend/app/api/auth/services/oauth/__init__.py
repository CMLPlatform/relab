"""OAuth services and router factories."""

from app.api.auth.services.oauth_clients import (
    GOOGLE_YOUTUBE_SCOPES,
    github_oauth_client,
    google_oauth_client,
    google_youtube_oauth_client,
)
from app.api.auth.services.oauth_utils import (
    ACCESS_TOKEN_KEY,
    CSRF_TOKEN_COOKIE_NAME,
    CSRF_TOKEN_KEY,
    FRONTEND_REDIRECT_URI_KEY,
    STATE_TOKEN_AUDIENCE,
    OAuth2AuthorizeResponse,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)

from .associate import build_oauth_associate_router
from .login import build_oauth_login_router

__all__ = [
    "ACCESS_TOKEN_KEY",
    "CSRF_TOKEN_COOKIE_NAME",
    "CSRF_TOKEN_KEY",
    "FRONTEND_REDIRECT_URI_KEY",
    "GOOGLE_YOUTUBE_SCOPES",
    "STATE_TOKEN_AUDIENCE",
    "OAuth2AuthorizeResponse",
    "OAuthCookieSettings",
    "build_oauth_associate_router",
    "build_oauth_login_router",
    "generate_csrf_token",
    "generate_state_token",
    "github_oauth_client",
    "google_oauth_client",
    "google_youtube_oauth_client",
]
