"""Unit tests for browser auth cookie scoping."""

from starlette.responses import Response

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    cookie_transport,
    set_browser_auth_cookie,
)


def test_cookie_transport_uses_host_only_auth_cookie() -> None:
    """The browser auth cookie should be scoped to the API host, not the parent domain."""
    assert cookie_transport.cookie_domain is None
    assert cookie_transport.cookie_secure is True


def test_refresh_cookie_is_host_only() -> None:
    """New refresh cookies should not include a Domain attribute."""
    assert REFRESH_COOKIE_NAME == "__Host-relab-refresh"
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
