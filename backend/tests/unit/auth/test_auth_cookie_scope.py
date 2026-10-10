"""Unit tests for browser auth cookie scoping."""

import uuid
from typing import Annotated
from unittest.mock import AsyncMock, MagicMock

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from httpx import ASGITransport
from starlette.responses import Response

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.access_token_store import ACCESS_TOKEN_KEY_PREFIX, RevocableRedisStrategy
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    cookie_transport,
    set_browser_auth_cookie,
)
from app.core.http_headers import request_has_auth_material
from app.core.redis import Redis

LEGACY_COOKIE_NAMES = ("__Host-relab-auth", "__Host-relab-refresh")


def test_cookie_transport_uses_host_only_auth_cookie() -> None:
    """The browser auth cookie should be scoped to the API host, not the parent domain."""
    assert cookie_transport.cookie_domain is None
    assert cookie_transport.cookie_secure is True


def test_refresh_cookie_is_host_only() -> None:
    """New refresh cookies should not include a Domain attribute."""
    assert REFRESH_COOKIE_NAME == "__Host-r9lab-refresh"
    response = Response()

    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value="refresh-token",
        max_age=auth_settings.refresh_token_ttl_seconds,
    )

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 1
    header = set_cookie_headers[0]
    assert f"{REFRESH_COOKIE_NAME}=refresh-token" in header
    assert "HttpOnly" in header
    assert "SameSite=lax" in header
    assert "Path=/" in header
    assert "Domain=" not in header


def test_refresh_cookie_is_always_secure() -> None:
    """Host-prefixed browser auth cookies always require HTTPS, regardless of environment."""
    response = Response()

    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value="refresh-token",
        max_age=auth_settings.refresh_token_ttl_seconds,
    )

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 1
    assert "Secure" in set_cookie_headers[0]


def test_clear_auth_cookies_deletes_current_host_only_scope() -> None:
    """Logout responses should clear only the current host-only cookies."""
    response = Response()

    clear_auth_cookies(response)

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 2
    assert all("Domain=" not in header for header in set_cookie_headers)
    assert all("HttpOnly" in header for header in set_cookie_headers)
    assert all("SameSite=lax" in header for header in set_cookie_headers)
    assert any(header.startswith(f"{AUTH_COOKIE_NAME}=") for header in set_cookie_headers)
    assert any(header.startswith(f"{REFRESH_COOKIE_NAME}=") for header in set_cookie_headers)


async def test_legacy_cookie_names_are_not_accepted(redis_client: Redis) -> None:
    """Sessions under the old cookie names are ignored: 401 and no auth material."""
    user = MagicMock()
    user.id = uuid.uuid4()
    token = await RevocableRedisStrategy(
        redis_client, lifetime_seconds=900, key_prefix=ACCESS_TOKEN_KEY_PREFIX
    ).write_token(user)
    manager = MagicMock()
    manager.parse_id = lambda value: value
    manager.get = AsyncMock(return_value=user)
    app = FastAPI()

    async def current_user(request: Request) -> str:
        cookie = await cookie_transport.scheme(request)
        strategy = RevocableRedisStrategy(
            redis_client, lifetime_seconds=900, key_prefix=ACCESS_TOKEN_KEY_PREFIX, request=request
        )
        if cookie is None or await strategy.read_token(cookie, manager) is None:
            raise HTTPException(status_code=401)
        return "ok"

    @app.get("/me")
    async def me(_: Annotated[str, Depends(current_user)]) -> None:
        return None

    @app.get("/material")
    async def material(request: Request) -> dict[str, bool]:
        return {"has": request_has_auth_material(request)}

    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        legacy = {"Cookie": "; ".join(f"{name}={token}" for name in LEGACY_COOKIE_NAMES)}
        assert (await client.get("/me", headers=legacy)).status_code == 401
        assert (await client.get("/material", headers=legacy)).json() == {"has": False}
        assert (await client.get("/me", headers={"Cookie": f"{AUTH_COOKIE_NAME}={token}"})).status_code == 200
