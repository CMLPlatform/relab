"""Unit tests for browser auth cookie scoping."""

from __future__ import annotations

from typing import TYPE_CHECKING

from starlette.responses import Response

from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    COOKIE_DOMAIN,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    cookie_transport,
)
from app.api.auth.services.login_hooks import set_refresh_token_cookie
from app.core.config import Environment
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    import pytest


def test_cookie_transport_uses_host_only_auth_cookie() -> None:
    """The browser auth cookie should be scoped to the API host, not the parent domain."""
    assert AUTH_COOKIE_NAME == "__Host-relab-auth"
    assert COOKIE_DOMAIN is None
    assert cookie_transport.cookie_domain is None
    assert cookie_transport.cookie_name == AUTH_COOKIE_NAME
    assert cookie_transport.cookie_secure is True


def test_refresh_cookie_is_host_only() -> None:
    """New refresh cookies should not include a Domain attribute."""
    assert REFRESH_COOKIE_NAME == "__Host-relab-refresh"
    response = Response()

    set_refresh_token_cookie(response, "refresh-token")

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 1
    header = set_cookie_headers[0]
    assert f"{REFRESH_COOKIE_NAME}=refresh-token" in header
    assert "HttpOnly" in header
    assert "SameSite=lax" in header
    assert "Path=/" in header
    assert "Domain=" not in header


def test_refresh_cookie_is_always_secure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Host-prefixed browser auth cookies should always require HTTPS."""
    monkeypatch.setattr(core_settings, "environment", Environment.DEV)
    response = Response()

    set_refresh_token_cookie(response, "refresh-token")

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
