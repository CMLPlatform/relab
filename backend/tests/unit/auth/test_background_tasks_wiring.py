"""Pins the router wiring that keeps transactional email off the response path.

The email tests inject ``request.state.background_tasks`` by hand, so every one of them
still passes if the router-level dependency that publishes it is dropped, and the send
silently goes back to blocking the response. These assert the wiring itself.
"""

from app.api.auth.routers.auth import router as auth_router
from app.api.auth.routers.oauth import router as oauth_router
from app.api.auth.routers.users import router as users_router
from app.api.common.routers.dependencies import attach_background_tasks


def _declares_attach(router: object) -> bool:
    """Whether a router carries the dependency at router level."""
    return any(
        getattr(dependency, "dependency", None) is attach_background_tasks
        for dependency in getattr(router, "dependencies", [])
    )


def test_mail_sending_routers_publish_their_background_tasks() -> None:
    """Every router whose handlers (or their user-manager hooks) send mail declares it.

    Router level, not route level: FastAPI resolves included routes lazily, and the routes
    that need this most (fastapi-users' verify and reset) are built by the library and
    mounted under ``auth_router``, so they inherit it rather than declaring it themselves.
    """
    for router in (auth_router, users_router, oauth_router):
        assert _declares_attach(router), f"{router} no longer declares attach_background_tasks"
