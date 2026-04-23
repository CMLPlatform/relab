"""OAuth helper DTOs and token utilities."""
# spell-checker: ignore fastapiusersoauthcsrf

import secrets
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import Response
from fastapi_users.jwt import SecretType, generate_jwt
from pydantic import BaseModel

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from typing import Literal

STATE_TOKEN_AUDIENCE = "fastapi-users:oauth-state"  # noqa: S105 # This value is not a secret
CSRF_TOKEN_KEY = "csrftoken"  # noqa: S105 # This value is not a secret
CSRF_TOKEN_COOKIE_NAME = "fastapiusersoauthcsrf"  # noqa: S105 # This value is not a secret
SET_COOKIE_HEADER = b"set-cookie"
ACCESS_TOKEN_KEY = "access_token"  # noqa: S105 # This value is not a secret


class OAuth2AuthorizeResponse(BaseModel):
    """Response model for OAuth2 authorization endpoint."""

    authorization_url: str


def generate_state_token(data: dict[str, str], secret: SecretType, lifetime_seconds: int | None = None) -> str:
    """Generate a JWT state token for OAuth flows."""
    data["aud"] = STATE_TOKEN_AUDIENCE
    return generate_jwt(data, secret, lifetime_seconds or auth_settings.oauth_state_token_ttl_seconds)


def generate_csrf_token() -> str:
    """Generate a CSRF token for OAuth flows."""
    return secrets.token_urlsafe(32)


@dataclass
class OAuthCookieSettings:
    """Configuration for OAuth CSRF cookies."""

    name: str = CSRF_TOKEN_COOKIE_NAME
    path: str = "/"
    domain: str | None = None
    secure: bool = core_settings.secure_cookies
    httponly: bool = True
    samesite: Literal["lax", "strict", "none"] = "lax"


def set_csrf_cookie(response: Response, cookie_settings: OAuthCookieSettings, csrf_token: str) -> None:
    """Set the CSRF cookie on the response."""
    response.set_cookie(
        cookie_settings.name,
        csrf_token,
        max_age=auth_settings.oauth_state_token_ttl_seconds,
        path=cookie_settings.path,
        domain=cookie_settings.domain,
        secure=cookie_settings.secure,
        httponly=cookie_settings.httponly,
        samesite=cookie_settings.samesite,
    )
