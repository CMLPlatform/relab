"""OAuth-related routes."""

from urllib.parse import urljoin

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.auth.config import settings
from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.exceptions import InvalidOAuthProviderError, OAuthAccountNotLinkedError
from app.api.auth.models import OAuthAccount
from app.api.auth.schemas import UserRead
from app.api.auth.services.oauth import (
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
    github_oauth_client,
    google_oauth_client,
    google_youtube_oauth_client,
)
from app.api.auth.services.user_manager import (
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.config import settings as core_settings

router = APIRouter(
    prefix="/auth/oauth",
    tags=["oauth"],
)


def _public_callback_url(path: str) -> str:
    """Build an absolute callback URL from the configured public API base URL."""
    return urljoin(f"{str(core_settings.backend_api_url).rstrip('/')}/", path.lstrip("/"))


for client in (github_oauth_client, google_oauth_client):
    provider_name = client.name
    # Google verifies email ownership, so auto-linking by email is safe.
    # GitHub does not guarantee verified emails, so we keep it off to prevent account takeover.
    associate_by_email = client is google_oauth_client

    # Authentication routers
    for auth_backend, transport in ((bearer_auth_backend, "token"), (cookie_auth_backend, "session")):
        router.include_router(
            CustomOAuthRouterBuilder(
                client,
                auth_backend,
                settings.fastapi_users_secret.get_secret_value(),
                redirect_url=_public_callback_url(f"/auth/oauth/{provider_name}/{transport}/callback"),
                is_verified_by_default=True,
                associate_by_email=associate_by_email,
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
            redirect_url=_public_callback_url(f"/auth/oauth/{provider_name}/associate/callback"),
        ).build(),
        prefix=f"/{provider_name}/associate",
    )


# YouTube-specific association (requests additional YouTube API scopes).
# Stored as oauth_name="google" — updates the same OAuthAccount record with
# a token that includes YouTube scopes.
router.include_router(
    CustomOAuthAssociateRouterBuilder(
        google_youtube_oauth_client,
        fastapi_user_manager.authenticator,
        UserRead,
        settings.fastapi_users_secret.get_secret_value(),
        redirect_url=_public_callback_url("/auth/oauth/google-youtube/associate/callback"),
        route_name_key="google-youtube",
    ).build(),
    prefix="/google-youtube/associate",
)


@router.delete("/{provider}/associate", status_code=status.HTTP_204_NO_CONTENT)
async def remove_oauth_association(
    provider: str,
    current_user: CurrentActiveUserDep,
    session: AsyncSessionDep,
) -> None:
    """Remove a linked OAuth account."""
    if provider not in ("google", "github"):
        raise InvalidOAuthProviderError(provider)

    query = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.oauth_name == provider,
    )
    result = await session.execute(query)
    oauth_account = result.scalars().first()

    if not oauth_account:
        raise OAuthAccountNotLinkedError(provider)

    await session.delete(oauth_account)
    await session.commit()
