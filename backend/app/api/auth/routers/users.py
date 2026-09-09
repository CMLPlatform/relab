"""Public user management routes."""

from datetime import UTC, datetime

from fastapi import Depends, Security

from app.api.auth.dependencies import (
    CurrentActiveUserDep,
    UserManagerDep,
    current_active_user,
)
from app.api.auth.models import User
from app.api.auth.schemas import (
    UserRead,
    UserUpdate,
)
from app.api.auth.services.user_manager import fastapi_user_manager
from app.api.auth.terms import CURRENT_TERMS_VERSION
from app.api.common.audiences import PublicAPIRouter
from app.api.common.rate_limiting import API_WRITE_RATE_LIMIT_DEPENDENCY
from app.api.common.routers.dependencies import attach_background_tasks

### User self-management routes ###

router = PublicAPIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Security(current_active_user), Depends(attach_background_tasks)],
)

# fastapi-users bundles superuser /{id} routes in the same router; those are dropped
# because by-id management lives on /admin/users, where every action is audit-logged.
_SELF_SERVICE_PATH = "/me"
_self_service_router = fastapi_user_manager.get_users_router(UserRead, UserUpdate)
_self_service_router.routes = [
    route for route in _self_service_router.routes if getattr(route, "path", None) == _SELF_SERVICE_PATH
]
router.include_router(_self_service_router)


@router.post(
    "/me/accept-terms",
    response_model=UserRead,
    summary="Accept the current contributor terms",
    dependencies=[API_WRITE_RATE_LIMIT_DEPENDENCY],
)
async def accept_terms(user: CurrentActiveUserDep, user_manager: UserManagerDep) -> User:
    """Record that this account accepted the contributor terms.

    The route takes no body: the server stamps ``CURRENT_TERMS_VERSION``, so a client
    cannot claim a grant under terms it was never shown. An acceptance already past the
    current version is kept.

    Writes through the user database: the account was loaded by the auth session, not
    ``AsyncSessionDep``, so committing on the latter would persist nothing.
    """
    accepted = max(user.terms_accepted_version or 0, CURRENT_TERMS_VERSION)
    if user.terms_accepted_version == accepted:
        # Already on record: keep the original acceptance timestamp.
        return user
    return await user_manager.user_db.update(
        user, {"terms_accepted_version": accepted, "terms_accepted_at": datetime.now(UTC)}
    )
