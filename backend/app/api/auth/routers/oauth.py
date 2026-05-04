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

router = APIRouter(prefix="/oauth", tags=["oauth"])
PUBLIC_OAUTH_CALLBACK_PREFIX = "/v1/oauth"


def _public_callback_url(path: str) -> str:
    """Build an absolute callback URL from the configured public API base URL."""
    return urljoin(f"{str(core_settings.backend_api_url).rstrip('/')}/", path.lstrip("/"))


def _include_oauth_routes(target_router: APIRouter, *, public_callback_prefix: str) -> None:
    """Include provider OAuth routes on one router."""
    oauth_state_secret = settings.oauth_state_secret.get_secret_value()
    for client in (github_oauth_client, google_oauth_client):
        provider_name = client.name
        # Google verifies email ownership, so auto-linking by email is safe.
        # GitHub does not guarantee verified emails, so we keep it off to prevent account takeover.
        associate_by_email = client is google_oauth_client

        # Authentication routers
        for auth_backend, transport in ((bearer_auth_backend, "token"), (cookie_auth_backend, "session")):
            target_router.include_router(
                CustomOAuthRouterBuilder(
                    client,
                    auth_backend,
                    oauth_state_secret,
                    redirect_url=_public_callback_url(f"{public_callback_prefix}/{provider_name}/{transport}/callback"),
                    is_verified_by_default=True,
                    associate_by_email=associate_by_email,
                ).build(),
                prefix=f"/{provider_name}/{transport}",
            )

        # Association router
        target_router.include_router(
            CustomOAuthAssociateRouterBuilder(
                client,
                fastapi_user_manager.authenticator,
                UserRead,
                oauth_state_secret,
                redirect_url=_public_callback_url(f"{public_callback_prefix}/{provider_name}/associate/callback"),
            ).build(),
            prefix=f"/{provider_name}/associate",
        )

    # YouTube-specific association (requests additional YouTube API scopes).
    # Stored as oauth_name="google" — updates the same OAuthAccount record with
    # a token that includes YouTube scopes.
    target_router.include_router(
        CustomOAuthAssociateRouterBuilder(
            google_youtube_oauth_client,
            fastapi_user_manager.authenticator,
            UserRead,
            oauth_state_secret,
            redirect_url=_public_callback_url(f"{public_callback_prefix}/google-youtube/associate/callback"),
            route_name_key="google-youtube",
            # Force Google to show the consent screen so the user explicitly grants
            # YouTube scopes, even if they already authorized the app for base scopes.
            # access_type=offline ensures we get a refresh token for background calls.
            authorize_extras_params={"access_type": "offline", "prompt": "consent"},
        ).build(),
        prefix="/google-youtube/associate",
    )


_include_oauth_routes(router, public_callback_prefix=PUBLIC_OAUTH_CALLBACK_PREFIX)


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
