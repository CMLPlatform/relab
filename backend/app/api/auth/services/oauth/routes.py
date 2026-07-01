"""OAuth router composition helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin

from fastapi import APIRouter

from app.api.auth.config import settings
from app.api.auth.schemas import UserRead
from app.api.auth.services.oauth.associate import build_oauth_associate_router
from app.api.auth.services.oauth.login import build_oauth_login_router
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend, fastapi_user_manager
from app.core.config import settings as core_settings

from .clients import github_oauth_client, google_oauth_client, google_youtube_oauth_client

if TYPE_CHECKING:
    from fastapi_users.authentication import AuthenticationBackend
    from httpx_oauth.oauth2 import BaseOAuth2

    from app.api.auth.models import User

PUBLIC_OAUTH_CALLBACK_PREFIX = "/v1/oauth"


@dataclass(frozen=True, slots=True)
class OAuthProviderRoutes:
    """Route policy for one OAuth login/association provider."""

    client: BaseOAuth2
    associate_by_email: bool


@dataclass(frozen=True, slots=True)
class OAuthBackendRoutes:
    """Route policy for one OAuth auth backend."""

    backend: AuthenticationBackend[User, Any]
    transport: str


LOGIN_PROVIDERS = (
    OAuthProviderRoutes(client=github_oauth_client, associate_by_email=False),
    OAuthProviderRoutes(client=google_oauth_client, associate_by_email=True),
)

AUTH_BACKENDS = (
    OAuthBackendRoutes(backend=bearer_auth_backend, transport="token"),
    OAuthBackendRoutes(backend=cookie_auth_backend, transport="session"),
)

YOUTUBE_ASSOCIATE_EXTRAS = {"access_type": "offline", "prompt": "consent"}


def public_callback_url(path: str) -> str:
    """Build an absolute callback URL from the configured public API base URL."""
    return urljoin(f"{str(core_settings.api_public_url).rstrip('/')}/", path.lstrip("/"))


def include_oauth_routes(
    target_router: APIRouter,
    *,
    public_callback_prefix: str = PUBLIC_OAUTH_CALLBACK_PREFIX,
) -> None:
    """Include all configured OAuth login and association routes."""
    oauth_state_secret = settings.oauth_state_secret.get_secret_value()

    for provider in LOGIN_PROVIDERS:
        provider_name = provider.client.name
        for backend_route in AUTH_BACKENDS:
            target_router.include_router(
                build_oauth_login_router(
                    provider.client,
                    backend_route.backend,
                    oauth_state_secret,
                    oauth_flow=f"{provider_name}:{backend_route.transport}",
                    redirect_url=public_callback_url(
                        f"{public_callback_prefix}/{provider_name}/{backend_route.transport}/callback"
                    ),
                    is_verified_by_default=True,
                    associate_by_email=provider.associate_by_email,
                ),
                prefix=f"/{provider_name}/{backend_route.transport}",
            )

        target_router.include_router(
            build_oauth_associate_router(
                provider.client,
                fastapi_user_manager.authenticator,
                UserRead,
                oauth_state_secret,
                oauth_flow=f"{provider_name}:associate",
                redirect_url=public_callback_url(f"{public_callback_prefix}/{provider_name}/associate/callback"),
            ),
            prefix=f"/{provider_name}/associate",
        )

    target_router.include_router(
        build_oauth_associate_router(
            google_youtube_oauth_client,
            fastapi_user_manager.authenticator,
            UserRead,
            oauth_state_secret,
            oauth_flow="google-youtube:associate",
            redirect_url=public_callback_url(f"{public_callback_prefix}/google-youtube/associate/callback"),
            route_name_key="google-youtube",
            extras_params=YOUTUBE_ASSOCIATE_EXTRAS,
        ),
        prefix="/google-youtube/associate",
    )
