"""Unit tests for the auth frontend routes."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.responses import RedirectResponse

from app.api.auth.routers.frontend import _safe_login_redirect_target, login_page, router


@pytest.mark.unit
class TestLoginPage:
    """Tests for the login page route."""

    def test_safe_login_redirect_target_allows_relative_paths(self) -> None:
        """Relative same-site paths should be preserved."""
        assert _safe_login_redirect_target("/dashboard?tab=1") == "/dashboard?tab=1"

    def test_safe_login_redirect_target_rejects_absolute_urls(self) -> None:
        """Absolute URLs should fall back to the index page."""
        assert _safe_login_redirect_target("https://evil.test") == str(router.url_path_for("index"))

    async def test_logged_in_user_redirects_to_safe_target(self) -> None:
        """Logged-in users should only be redirected to safe internal targets."""
        response = await login_page(MagicMock(), MagicMock(), next_page="https://evil.test")

        assert isinstance(response, RedirectResponse)
        assert response.headers["location"] == str(router.url_path_for("index"))
