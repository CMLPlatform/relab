"""Unit tests for the auth frontend routes."""
# spell-checker: ignore noopener, noreferrer

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.responses import RedirectResponse
from httpx import ASGITransport, AsyncClient

from app.api.auth.dependencies import optional_current_active_user
from app.api.auth.routers.frontend import login_page, router
from app.main import create_app

pytestmark = pytest.mark.anyio

HOMEPAGE_LINK_ATTRIBUTES = ('target="_blank"', 'rel="noopener noreferrer"', 'class="primary-btn"')
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


def assert_contains_all(text: str, snippets: tuple[str, ...]) -> None:
    """Assert every expected HTML attribute snippet is present."""
    for snippet in snippets:
        assert snippet in text


async def test_backend_html_templates_include_browser_security_hints() -> None:
    """Backend HTML pages should include the OWASP browser-side hints they own."""
    app = create_app()
    app.dependency_overrides[optional_current_active_user] = lambda: None

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        homepage_response = await client.get("/v1/")
        login_response = await client.get("/v1/login")

    assert homepage_response.status_code == 200
    assert login_response.status_code == 200
    assert_contains_all(homepage_response.text, HOMEPAGE_LINK_ATTRIBUTES)
    assert_contains_all(login_response.text, EMAIL_INPUT_ATTRIBUTES)
    assert_contains_all(login_response.text, PASSWORD_INPUT_ATTRIBUTES)


class TestLoginPage:
    """Tests for the login page route."""

    async def test_logged_in_user_redirects_to_safe_target(self) -> None:
        """Logged-in users should always be redirected to the index page."""
        response = await login_page(MagicMock(), MagicMock(), next_page="https://evil.test")

        assert isinstance(response, RedirectResponse)
        assert response.headers["location"] == str(router.url_path_for("index"))
