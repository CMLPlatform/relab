"""OAuth-related routes."""

from fastapi import APIRouter, Security

from app.api.auth.config import settings
from app.api.auth.dependencies import current_active_superuser
from app.api.auth.schemas import UserRead
from app.api.auth.services.oauth import github_oauth_client, google_oauth_client
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend, fastapi_user_manager

# TODO: include simple UI for OAuth login and association on login page
# TODO: Create single callback endpoint for each provider at /auth/oauth/{provider}/callback
# This requires us to manually set up a single callback route that can handle multiple actions
# (token login, session login, association)

router = APIRouter(
    prefix="/auth/oauth",
    tags=["oauth"],
    dependencies=[  # TODO: Remove superuser dependency when enabling public OAuth login
        Security(current_active_superuser)
    ],
)

for oauth_client in (github_oauth_client, google_oauth_client):
    provider_name = oauth_client.name

    # Authentication router for token (bearer transport) and session (cookie transport) methods

    # TODO: Investigate: Session-based Oauth login is currently not redirecting from the auth provider to the callback.
    for auth_backend, transport_method in ((bearer_auth_backend, "token"), (cookie_auth_backend, "session")):
        router.include_router(
            fastapi_user_manager.get_oauth_router(
                oauth_client,
                auth_backend,
                settings.fastapi_users_secret.get_secret_value(),
                associate_by_email=True,
                is_verified_by_default=True,
            ),
            prefix=f"/{provider_name}/{transport_method}",
        )

    # Association router
    router.include_router(
        fastapi_user_manager.get_oauth_associate_router(
            oauth_client,
            UserRead,
            settings.fastapi_users_secret.get_secret_value(),
        ),
        prefix=f"/{provider_name}/associate",
    )
