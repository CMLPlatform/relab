"""Authentication backend and transport wiring."""

from typing import cast

from fastapi import Response
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    RedisStrategy,
    Strategy,
)
from pydantic import UUID4

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import User
from app.core.http_headers import AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME
from app.core.redis import RedisDep

ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds


# Session cookies are host-only to avoid exposing credentials to sibling subdomains.
# Names live in core/http_headers (single source); re-exported here for the auth API.
COOKIE_DOMAIN: str | None = None
COOKIE_PATH: str = "/"
AUTH_COOKIE_NAMES = (AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME)

cookie_transport = CookieTransport(
    cookie_name=AUTH_COOKIE_NAME,
    cookie_max_age=ACCESS_TOKEN_TTL,
    cookie_domain=COOKIE_DOMAIN,
    cookie_secure=True,
)


def set_browser_auth_cookie(response: Response, *, key: str, value: str, max_age: int) -> None:
    """Attach a host-only browser auth cookie."""
    response.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        httponly=True,
        secure=True,
        samesite="lax",
    )


def set_session_auth_cookies(response: Response, *, access_token: str, refresh_token: str) -> None:
    """Attach the access + refresh cookie pair for a browser session."""
    set_browser_auth_cookie(
        response,
        key=AUTH_COOKIE_NAME,
        value=access_token,
        max_age=ACCESS_TOKEN_TTL,
    )
    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=auth_settings.refresh_token_ttl_seconds,
    )


def _delete_cookie(response: Response, name: str, domain: str | None) -> None:
    response.delete_cookie(
        name,
        path=COOKIE_PATH,
        domain=domain,
        secure=True,
        httponly=True,
        samesite="lax",
    )


def clear_auth_cookies(response: Response) -> None:
    """Delete browser auth cookies from the current scope."""
    for name in AUTH_COOKIE_NAMES:
        _delete_cookie(response, name, COOKIE_DOMAIN)


bearer_transport = BearerTransport(tokenUrl="/v1/auth/bearer/login")


def get_token_strategy(redis: RedisDep) -> Strategy[User, UUID4]:
    """Return an authentication token strategy."""
    return cast("Strategy[User, UUID4]", RedisStrategy(redis, lifetime_seconds=ACCESS_TOKEN_TTL))


def build_authentication_backends() -> tuple[AuthenticationBackend[User, UUID4], AuthenticationBackend[User, UUID4]]:
    """Create the bearer and cookie authentication backends."""
    bearer_auth_backend = AuthenticationBackend(
        name="bearer",
        transport=bearer_transport,
        get_strategy=get_token_strategy,
    )
    cookie_auth_backend = AuthenticationBackend(
        name="cookie",
        transport=cookie_transport,
        get_strategy=get_token_strategy,
    )
    return bearer_auth_backend, cookie_auth_backend
