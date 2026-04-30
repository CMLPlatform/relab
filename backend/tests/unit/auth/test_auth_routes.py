"""Unit tests for auth router composition."""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.api.auth.routers.auth import FORGOT_PASSWORD_PATH, router


def test_forgot_password_route_is_rate_limited() -> None:
    """The password-reset e-mail request endpoint should be wrapped by the limiter."""
    route = next(
        route for route in router.routes if isinstance(route, APIRoute) and route.path == f"/auth{FORGOT_PASSWORD_PATH}"
    )

    assert hasattr(route.endpoint, "__wrapped__")
