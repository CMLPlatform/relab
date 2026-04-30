"""Authentication backend and transport wiring."""

from typing import cast

from fastapi import HTTPException, Response
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    JWTStrategy,
    RedisStrategy,
    Strategy,
)
from pydantic import UUID4, SecretStr

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import User
from app.core.config import Environment
from app.core.config import settings as core_settings
from app.core.redis import OptionalRedisDep

ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
SECRET: SecretStr = auth_settings.fastapi_users_secret


# Session cookies are host-only to avoid exposing credentials to sibling subdomains.
COOKIE_DOMAIN: str | None = None
COOKIE_PATH: str = "/"
AUTH_COOKIE_NAME = "auth"
REFRESH_COOKIE_NAME = "refresh_token"
AUTH_COOKIE_NAMES = (AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME)

cookie_transport = CookieTransport(
    cookie_name=AUTH_COOKIE_NAME,
    cookie_max_age=ACCESS_TOKEN_TTL,
    cookie_domain=COOKIE_DOMAIN,
    cookie_secure=core_settings.secure_cookies,
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
        secure=core_settings.secure_cookies,
        samesite="lax",
    )


def _delete_cookie(response: Response, name: str, domain: str | None) -> None:
    response.delete_cookie(
        name,
        path=COOKIE_PATH,
        domain=domain,
        secure=core_settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )


def clear_auth_cookies(response: Response) -> None:
    """Delete browser auth cookies from the current scope."""
    for name in AUTH_COOKIE_NAMES:
        _delete_cookie(response, name, COOKIE_DOMAIN)


bearer_transport = BearerTransport(tokenUrl="auth/login")


def get_token_strategy(redis: OptionalRedisDep) -> Strategy[User, UUID4]:
    """Return an authentication token strategy."""
    if redis:
        return cast("Strategy[User, UUID4]", RedisStrategy(redis, lifetime_seconds=ACCESS_TOKEN_TTL))

    if core_settings.environment not in (Environment.DEV, Environment.TESTING):
        raise HTTPException(status_code=503, detail="Authentication service unavailable: Redis is required.")

    return cast(
        "Strategy[User, UUID4]",
        JWTStrategy(secret=SECRET.get_secret_value(), lifetime_seconds=ACCESS_TOKEN_TTL),
    )


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
