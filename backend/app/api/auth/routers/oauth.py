"""OAuth-related routes."""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.auth.config import settings
from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.models import OAuthAccount
from app.api.auth.schemas import UserRead
from app.api.auth.services.oauth import (
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
    github_oauth_client,
    google_oauth_client,
)
from app.api.auth.services.user_manager import (
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(
    prefix="/auth/oauth",
    tags=["oauth"],
)

for client in (github_oauth_client, google_oauth_client):
    provider_name = client.name

    # Authentication routers
    for auth_backend, transport in ((bearer_auth_backend, "token"), (cookie_auth_backend, "session")):
        router.include_router(
            CustomOAuthRouterBuilder(
                client,
                auth_backend,
                settings.fastapi_users_secret.get_secret_value(),
                associate_by_email=True,
                is_verified_by_default=True,
            ).build(),
            prefix=f"/{provider_name}/{transport}",
        )

    # Association router
    router.include_router(
        CustomOAuthAssociateRouterBuilder(
            client,
            fastapi_user_manager.authenticator,
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
