"""The public profile route.

Joins an account to the contribution stats computed over its products, so it spans
`auth` and `data_collection` and belongs in the application layer rather than inside
either. The path and tag are unchanged.
"""

from typing import Annotated, cast

from fastapi import HTTPException, Response, Security
from sqlalchemy import select

from app.api.auth.dependencies import optional_current_active_user
from app.api.auth.models import User
from app.api.auth.profile_stats import load_profile_stats
from app.api.auth.schemas import PublicProfileView, normalize_username
from app.api.auth.services.privacy import can_view_profile
from app.api.common.audiences import PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.crud.profile_stats import compute_profile_stats

router = PublicAPIRouter(prefix="/profiles", tags=["profiles"])


@router.get(
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
