"""OAuth-related routes."""

from fastapi import APIRouter, BackgroundTasks, status

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.services.oauth import accounts as oauth_accounts
from app.api.auth.services.oauth.routes import (
    PUBLIC_OAUTH_CALLBACK_PREFIX,
    include_oauth_routes,
)
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/oauth", tags=["oauth"])


include_oauth_routes(router, public_callback_prefix=PUBLIC_OAUTH_CALLBACK_PREFIX)


@router.delete("/{provider}/associate", status_code=status.HTTP_204_NO_CONTENT)
async def remove_oauth_association(
    provider: str,
    current_user: CurrentActiveUserDep,
    session: AsyncSessionDep,
    background_tasks: BackgroundTasks,
) -> None:
    """Remove a linked OAuth account."""
    await oauth_accounts.remove_oauth_association(
        provider=provider,
        current_user=current_user,
        session=session,
        background_tasks=background_tasks,
    )
