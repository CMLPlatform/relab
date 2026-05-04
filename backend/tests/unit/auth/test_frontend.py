"""Unit tests for the auth frontend routes."""
# spell-checker: ignore gstatic, noopener, noreferrer

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.auth.dependencies import optional_current_active_user
from app.main import create_app

pytestmark = pytest.mark.anyio

HOMEPAGE_LINK_ATTRIBUTES = ('target="_blank"', 'rel="noopener noreferrer"', 'class="primary-btn"')
HOMEPAGE_SCRIPT_ATTRIBUTES = (
    'data-logout-url="',
    "/v1/auth/logout",
    '<script src="/static/js/backend-index.js" defer></script>',
)
HOMEPAGE_DOC_LINKS = (
    'href="https://api.example.test/docs/public"',
    "Public API Documentation",
    'href="https://api.example.test/docs/device"',
    "Device Integration Documentation",
)
EMAIL_INPUT_ATTRIBUTES = (
    'type="email"',
    'id="email"',
    'name="email"',
    'autocomplete="username"',
    'autocorrect="off"',
    'autocapitalize="none"',
    'spellcheck="false"',
)
PASSWORD_INPUT_ATTRIBUTES = (
    'type="password"',
    'id="password"',
    'name="password"',
    'autocomplete="current-password"',
    'autocorrect="off"',
    'autocapitalize="none"',
    'spellcheck="false"',
)
LOGIN_SCRIPT_ATTRIBUTES = (
    'data-login-url="/v1/auth/session/login"',
    'data-default-next="',
    '<script src="/static/js/backend-login.js" defer></script>',
    '<div id="error" class="error" hidden></div>',
)


def assert_contains_all(text: str, snippets: tuple[str, ...]) -> None:
    """Assert every expected HTML attribute snippet is present."""
    for snippet in snippets:
        assert snippet in text


CURRENT_USER_LOOKUP_ERROR = "current user lookup should not run"


async def test_backend_html_templates_include_browser_security_hints() -> None:
    """Backend HTML pages should include the OWASP browser-side hints they own."""
    app = create_app()
    app.dependency_overrides[optional_current_active_user] = lambda: None

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        homepage_response = await client.get("/")
        login_response = await client.get("/login")

    assert homepage_response.status_code == 200
    assert login_response.status_code == 200
    assert_contains_all(homepage_response.text, HOMEPAGE_LINK_ATTRIBUTES)
    assert_contains_all(homepage_response.text, HOMEPAGE_SCRIPT_ATTRIBUTES)
    assert_contains_all(homepage_response.text, HOMEPAGE_DOC_LINKS)
    assert 'href="https://api.example.test/docs"' not in homepage_response.text
    assert 'href="https://api.example.test/redoc"' not in homepage_response.text
    assert_contains_all(login_response.text, EMAIL_INPUT_ATTRIBUTES)
    assert_contains_all(login_response.text, PASSWORD_INPUT_ATTRIBUTES)
    assert_contains_all(login_response.text, LOGIN_SCRIPT_ATTRIBUTES)
    assert "fonts.googleapis.com" not in homepage_response.text
    assert "fonts.googleapis.com" not in login_response.text
    assert "fonts.gstatic.com" not in homepage_response.text
    assert "fonts.gstatic.com" not in login_response.text
    assert "<script>" not in homepage_response.text
    assert "<script>" not in login_response.text


async def test_backend_html_pages_are_not_part_of_versioned_api() -> None:
    """Browser pages should not live under the versioned API contract."""
    app = create_app()
    app.dependency_overrides[optional_current_active_user] = lambda: None

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        homepage_response = await client.get("/v1/")
        login_response = await client.get("/v1/login")

    assert homepage_response.status_code == 404
    assert login_response.status_code == 404


async def test_login_page_does_not_require_current_user_lookup() -> None:
    """The public login form should render without a database-backed auth lookup."""
    app = create_app()

    def fail_current_user_lookup() -> None:
        raise AssertionError(CURRENT_USER_LOOKUP_ERROR)

    app.dependency_overrides[optional_current_active_user] = fail_current_user_lookup

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/login")

    assert response.status_code == 200
    assert_contains_all(response.text, EMAIL_INPUT_ATTRIBUTES)
    assert_contains_all(response.text, PASSWORD_INPUT_ATTRIBUTES)


async def test_login_page_keeps_safe_relative_next_target() -> None:
    """The login page should expose only sanitized relative redirect targets."""
    app = create_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        safe_response = await client.get("/login?next=/dashboard")
        unsafe_response = await client.get("/login?next=https://evil.example")

    assert safe_response.status_code == 200
    assert 'name="next" value="/dashboard"' in safe_response.text
    assert unsafe_response.status_code == 200
    assert 'name="next"' not in unsafe_response.text
