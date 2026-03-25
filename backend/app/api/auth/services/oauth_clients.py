"""OAuth client instances and scope definitions."""

from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES
from httpx_oauth.clients.google import GoogleOAuth2

from app.api.auth.config import settings

# Google
google_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_BASE_SCOPES,
)

# YouTube (only used for RPi-cam plugin)
GOOGLE_YOUTUBE_SCOPES = GOOGLE_BASE_SCOPES + settings.youtube_api_scopes
google_youtube_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_YOUTUBE_SCOPES,
)

# GitHub
github_oauth_client = GitHubOAuth2(
    settings.github_oauth_client_id.get_secret_value(),
    settings.github_oauth_client_secret.get_secret_value(),
)
