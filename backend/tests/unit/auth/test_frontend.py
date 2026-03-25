"""Unit tests for the auth frontend routes."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.responses import RedirectResponse

from app.api.auth.routers.frontend import login_page, router


@pytest.mark.unit
class TestLoginPage:
    """Tests for the login page route."""

    async def test_logged_in_user_redirects_to_safe_target(self) -> None:
        """Logged-in users should always be redirected to the index page."""
        response = await login_page(MagicMock(), MagicMock(), next_page="https://evil.test")

        assert isinstance(response, RedirectResponse)
        assert response.headers["location"] == str(router.url_path_for("index"))
