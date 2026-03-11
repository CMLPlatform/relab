"""OAuth-related routes."""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.auth.config import settings
from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.routers.custom_oauth import (
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
)
from app.api.auth.schemas import UserRead
from app.api.auth.services.oauth import github_oauth_client, google_oauth_client
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend, fastapi_user_manager
from app.api.common.routers.dependencies import AsyncSessionDep

# TODO: include simple UI for OAuth login and association on login page
# TODO: Create single callback endpoint for each provider at /auth/oauth/{provider}/callback
# Note: Refresh tokens and sessions are now automatically created via UserManager.on_after_login hook

router = APIRouter(
    prefix="/auth/oauth",
    tags=["oauth"],
)

for oauth_client in (github_oauth_client, google_oauth_client):
    provider_name = oauth_client.name

    # Authentication router for token (bearer transport) and session (cookie transport) methods

    # TODO: Investigate: Session-based Oauth login is currently not redirecting from the auth provider to the callback.
    for auth_backend, transport_method in ((bearer_auth_backend, "token"), (cookie_auth_backend, "session")):
        router.include_router(
            CustomOAuthRouterBuilder(
                oauth_client,
                auth_backend,
                fastapi_user_manager.get_user_manager,
                settings.fastapi_users_secret.get_secret_value(),
                associate_by_email=True,
                is_verified_by_default=True,
            ).build(),
            prefix=f"/{provider_name}/{transport_method}",
        )

    # Association router
    router.include_router(
        CustomOAuthAssociateRouterBuilder(
            oauth_client,
            fastapi_user_manager.authenticator,
            fastapi_user_manager.get_user_manager,
            UserRead,
            settings.fastapi_users_secret.get_secret_value(),
        ).build(),
        prefix=f"/{provider_name}/associate",
    )

@router.delete("/{provider}/associate", status_code=status.HTTP_204_NO_CONTENT)
async def remove_oauth_association(
    provider: str,
    current_user: CurrentActiveUserDep,
    session: AsyncSessionDep,
) -> None:
    """Remove a linked OAuth account."""
    if provider not in ("google", "github"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth provider.")

    query = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.oauth_name == provider,
    )
    result = await session.exec(query)
    oauth_account = result.first()

    if not oauth_account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAuth account not linked.")

    await session.delete(oauth_account)
    await session.commit()
