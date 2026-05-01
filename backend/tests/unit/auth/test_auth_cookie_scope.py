"""Unit tests for browser auth cookie scoping."""

from __future__ import annotations

from typing import TYPE_CHECKING

from starlette.responses import Response

from app.api.auth.services.auth_backends import (
    COOKIE_DOMAIN,
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
    assert COOKIE_DOMAIN is None
    assert cookie_transport.cookie_domain is None


def test_refresh_cookie_is_host_only() -> None:
    """New refresh cookies should not include a Domain attribute."""
    response = Response()

    set_refresh_token_cookie(response, "refresh-token")

    set_cookie_headers = response.headers.getlist("set-cookie")
    assert len(set_cookie_headers) == 1
    header = set_cookie_headers[0]
    assert "refresh_token=refresh-token" in header
    assert "HttpOnly" in header
    assert "SameSite=lax" in header
    assert "Domain=" not in header


def test_refresh_cookie_is_secure_in_production_like_environments(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production-like browser auth cookies should require HTTPS."""
    monkeypatch.setattr(core_settings, "environment", Environment.PROD)
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
    assert any(header.startswith("auth=") for header in set_cookie_headers)
    assert any(header.startswith("refresh_token=") for header in set_cookie_headers)
