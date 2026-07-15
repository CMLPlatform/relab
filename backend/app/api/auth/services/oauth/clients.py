"""OAuth client instances and scope definitions."""

from typing import TYPE_CHECKING, Any, cast

from httpx_oauth.clients.github import EMAILS_ENDPOINT as GITHUB_EMAILS_ENDPOINT
from httpx_oauth.clients.github import PROFILE_ENDPOINT as GITHUB_PROFILE_ENDPOINT
from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.exceptions import GetIdEmailError, GetProfileError

from app.api.auth.config import settings
from app.core.clients import create_http_client

if TYPE_CHECKING:
    from httpx import AsyncClient


class _RelabGoogleOAuth2(GoogleOAuth2):
    """Google OAuth client that uses Relab's shared outbound HTTP policy."""

    def get_httpx_client(self) -> AsyncClient:
        """Return the shared SSRF-hardened HTTP client."""
        return create_http_client()

    async def get_id_email(self, token: str) -> tuple[str, str | None]:
        """Return (id, primary email) only when Google marks that email verified.

        Defense-in-depth: ``associate_by_email=True`` trusts this address to link
        existing accounts, so refuse an unverified primary rather than trust the
        provider blindly. Google only exposes owned addresses as primary today, so
        this never rejects a real login — it just removes the standing assumption.
        """
        try:
            profile = await self.get_profile(token)
        except GetProfileError as exc:
            raise GetIdEmailError(response=exc.response) from exc
        email = next(
            (
                entry["value"]
                for entry in profile.get("emailAddresses", [])
                if entry["metadata"].get("primary") and entry["metadata"].get("verified")
            ),
            None,
        )
        return profile["resourceName"], email


class _RelabGitHubOAuth2(GitHubOAuth2):
    """GitHub OAuth client that uses Relab's shared outbound HTTP policy."""

    def get_httpx_client(self) -> AsyncClient:
        """Return the shared SSRF-hardened HTTP client."""
        return create_http_client()

    async def _get_authenticated_json(self, token: str, endpoint: str) -> object:
        """Return one authenticated GitHub JSON response through the shared HTTP client."""
        async with create_http_client() as client:
            response = await client.get(
                endpoint,
                headers={**self.request_headers, "Authorization": f"token {token}"},
            )

        if response.status_code >= 400:
            raise GetProfileError(response=response)

        return response.json()

    async def get_profile(self, token: str) -> dict[str, Any]:
        """Return the GitHub profile through the shared HTTP client."""
        return cast("dict[str, Any]", await self._get_authenticated_json(token, GITHUB_PROFILE_ENDPOINT))

    async def get_emails(self, token: str) -> list[dict[str, Any]]:
        """Return GitHub email addresses through the shared HTTP client."""
        return cast("list[dict[str, Any]]", await self._get_authenticated_json(token, GITHUB_EMAILS_ENDPOINT))


# Google
google_oauth_client = _RelabGoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_BASE_SCOPES,
)

# YouTube (only used for RPi-cam plugin)
YOUTUBE_API_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
GOOGLE_YOUTUBE_SCOPES = GOOGLE_BASE_SCOPES + YOUTUBE_API_SCOPES
google_youtube_oauth_client = _RelabGoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_YOUTUBE_SCOPES,
)

# GitHub
github_oauth_client = _RelabGitHubOAuth2(
    settings.github_oauth_client_id.get_secret_value(),
    settings.github_oauth_client_secret.get_secret_value(),
)
