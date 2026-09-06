"""Public user management routes."""

from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import HTTPException, Response, Security
from sqlalchemy import select

from app.api.auth.dependencies import (
    CurrentActiveUserDep,
    UserManagerDep,
    current_active_user,
    optional_current_active_user,
)
from app.api.auth.models import User
from app.api.auth.profile_stats import load_profile_stats
from app.api.auth.schemas import (
    PublicProfileView,
    UserRead,
    UserUpdate,
    normalize_username,
)
from app.api.auth.services.privacy import can_view_profile
from app.api.auth.services.user_manager import fastapi_user_manager
from app.api.auth.terms import CURRENT_TERMS_VERSION
from app.api.common.audiences import PublicAPIRouter
from app.api.common.rate_limiting import API_WRITE_RATE_LIMIT_DEPENDENCY
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.crud.profile_stats import compute_profile_stats

### User self-management routes ###

router = PublicAPIRouter(prefix="/users", tags=["users"], dependencies=[Security(current_active_user)])

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


## Public Profile Routes ##

public_profile_router = PublicAPIRouter(prefix="/profiles", tags=["profiles"])


@public_profile_router.get(
    "/{username}",
    response_model=PublicProfileView,
    summary="Get public profile of a user",
)
async def get_public_profile(
    username: str,
    response: Response,
    session: AsyncSessionDep,
    current_user: Annotated[User | None, Security(optional_current_active_user)],
) -> PublicProfileView:
    """Get public profile statistics for a specified user by username.

    Returns 404 if the user is not found or if the profile is marked as private (and you are not the user).
    Recomputes stats on the fly when no snapshot exists yet, without persisting the result.
    """
    # Viewer-dependent response: visibility changes with auth state.
    response.headers["Cache-Control"] = "private, no-store"

    lookup_username = cast("str", normalize_username(username))
    stmt = select(User).where(User.username == lookup_username)
    result = await session.execute(stmt)
    user = result.unique().scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")

    if not can_view_profile(user, current_user):
        raise HTTPException(status_code=404, detail="Profile not found")

    # No snapshot yet: compute without writing (a committing GET breaks read-replica
    # routing). The product create/delete path persists the snapshot.
    if user.profile_stats_computed_at is None or not user.profile_stats:
        stats = await compute_profile_stats(session, user.id)
    else:
        stats = load_profile_stats(user.profile_stats)

    return PublicProfileView.from_profile_stats(
        username=lookup_username,
        created_at=user.created_at,
        stats=stats,
    )
