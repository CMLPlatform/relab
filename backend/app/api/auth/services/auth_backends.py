"""Authentication backend and transport wiring."""

import ipaddress
from typing import cast
from urllib.parse import urlparse

from fastapi import HTTPException
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


def build_cookie_domain(frontend_url: str) -> str | None:
    """Build a cookie domain from the configured frontend URL."""
    hostname = urlparse(frontend_url).hostname or ""
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        parts = hostname.split(".")
        return f".{'.'.join(parts[-2:])}" if len(parts) >= 2 else None
    else:
        return None


cookie_transport = CookieTransport(
    cookie_name="auth",
    cookie_max_age=ACCESS_TOKEN_TTL,
    cookie_domain=build_cookie_domain(str(core_settings.frontend_web_url)),
    cookie_secure=core_settings.secure_cookies,
)

bearer_transport = BearerTransport(tokenUrl="auth/bearer/login")


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
