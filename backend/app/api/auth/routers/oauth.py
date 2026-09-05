"""OAuth-related routes."""

from typing import Annotated

from fastapi import BackgroundTasks, Body, status

from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.schemas import OAuthStepUpRequest
from app.api.auth.services.oauth import accounts as oauth_accounts
from app.api.auth.services.oauth.routes import (
    PUBLIC_OAUTH_CALLBACK_PREFIX,
    include_oauth_routes,
)
from app.api.common.audiences import PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep

router = PublicAPIRouter(prefix="/oauth", tags=["oauth"])


include_oauth_routes(router, public_callback_prefix=PUBLIC_OAUTH_CALLBACK_PREFIX)


@router.delete("/{provider}/associate", status_code=status.HTTP_204_NO_CONTENT)
async def remove_oauth_association(
    provider: str,
    current_user: CurrentActiveUserDep,
    session: AsyncSessionDep,
    user_manager: UserManagerDep,
    background_tasks: BackgroundTasks,
    payload: Annotated[OAuthStepUpRequest | None, Body()] = None,
) -> None:
    """Remove a linked OAuth account (step-up re-auth if the account has a password)."""
    current_password = payload.current_password.get_secret_value() if payload and payload.current_password else None
    await oauth_accounts.remove_oauth_association(
        provider=provider,
        current_user=current_user,
        session=session,
        password_helper=user_manager.password_helper,
        current_password=current_password,
        background_tasks=background_tasks,
    )
