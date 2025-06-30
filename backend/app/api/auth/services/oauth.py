"""OAuth services."""

from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES
from httpx_oauth.clients.google import GoogleOAuth2

from app.api.auth.config import settings

### Google OAuth ###
# Standard Google OAuth (no YouTube)
google_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id, settings.google_oauth_client_secret, scopes=GOOGLE_BASE_SCOPES
)

# YouTube-specific OAuth (only used for RPi-cam plugin)
GOOGLE_YOUTUBE_SCOPES = GOOGLE_BASE_SCOPES + settings.youtube_api_scopes
google_youtube_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id, settings.google_oauth_client_secret, scopes=GOOGLE_YOUTUBE_SCOPES
)


### GitHub OAuth ###
github_oauth_client = GitHubOAuth2(settings.github_oauth_client_id, settings.github_oauth_client_secret)
