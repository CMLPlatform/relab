"""OAuth-related routes."""

from typing import Annotated

from fastapi import BackgroundTasks, Body, Depends, status

from app.api.auth.dependencies import CurrentActiveUserDep, UserManagerDep
from app.api.auth.schemas import StepUpRequest
from app.api.auth.services.oauth import accounts as oauth_accounts
from app.api.auth.services.oauth.routes import (
    PUBLIC_OAUTH_CALLBACK_PREFIX,
    include_oauth_routes,
)
from app.api.common.audiences import PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep, attach_background_tasks
from app.core.redis import RedisDep

router = PublicAPIRouter(prefix="/oauth", tags=["oauth"], dependencies=[Depends(attach_background_tasks)])


include_oauth_routes(router, public_callback_prefix=PUBLIC_OAUTH_CALLBACK_PREFIX)


@router.delete("/{provider}/associate", status_code=status.HTTP_204_NO_CONTENT)
async def remove_oauth_association(
    provider: str,
    current_user: CurrentActiveUserDep,
    session: AsyncSessionDep,
    user_manager: UserManagerDep,
    background_tasks: BackgroundTasks,
    redis: RedisDep,
    payload: Annotated[StepUpRequest | None, Body()] = None,
) -> None:
    """Remove a linked OAuth account (password and MFA step-up where the account has them)."""
    current_password = payload.current_password.get_secret_value() if payload and payload.current_password else None
    await oauth_accounts.remove_oauth_association(
        provider=provider,
        current_user=current_user,
        session=session,
        user_manager=user_manager,
        redis=redis,
        current_password=current_password,
        mfa_code=payload.mfa_code if payload else None,
        background_tasks=background_tasks,
    )
