"""Authentication backend for the SQLAdmin interface, based on FastAPI-Users authentication backend."""

import json
from typing import Literal

from fastapi import Response, status
from fastapi.responses import RedirectResponse
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.requests import Request

from app.api.admin.config import settings as admin_settings
from app.api.auth.config import settings as auth_settings
from app.api.auth.routers.frontend import router as frontend_auth_router
from app.api.auth.services.user_manager import cookie_transport, get_jwt_strategy
from app.api.auth.utils.context_managers import get_chained_async_user_manager_context
from app.core.database import async_engine

async_session_generator = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)

# TODO: Redirect all backend login systems (admin panel, swagger docs, API landing page) to frontend login system
main_login_page_redirect_path = (
    f"{frontend_auth_router.url_path_for('login_page')}?next={admin_settings.admin_base_url}"
)


class AdminAuth(AuthenticationBackend):
    """Authentication backend for the SQLAdmin interface, using FastAPI-Users."""

    async def login(self, request: Request) -> bool:  # noqa: ARG002 # Signature expected by the SQLAdmin implementation
        """Placeholder logout  function.

        Login is handled by the authenticate method, which redirects to the main API login page.
        """
        return True

    async def logout(self, request: Request) -> bool:  # noqa: ARG002 # Signature expected by the SQLAdmin implementation
        """Placeholder logout  function.

        Logout requires unsetting a cookie, which is not possible in the standard SQLAdmin logout function,
        which is excepted to return a boolean.
        Instead, the default logout route is overridden by the custom route below.
        """
        return True

    async def authenticate(self, request: Request) -> RedirectResponse | Response | Literal[True]:
        token = request.cookies.get(cookie_transport.cookie_name)
        if not token:
            return RedirectResponse(url=main_login_page_redirect_path)
        async with get_chained_async_user_manager_context() as user_manager:
            user = await get_jwt_strategy().read_token(token=token, user_manager=user_manager)
            if user is None:
                return RedirectResponse(url=main_login_page_redirect_path)
            if not user.is_superuser:
                return Response(
                    json.dumps({"detail": "You do not have permission to access this resource."}),
                    status_code=status.HTTP_403_FORBIDDEN,
                    media_type="application/json",
                )

        return True


def get_authentication_backend() -> AdminAuth:
    """Get the authentication backend for the SQLAdmin interface."""
    return AdminAuth(secret_key=auth_settings.fastapi_users_secret)


async def logout_override(request: Request) -> RedirectResponse:  # noqa: ARG001 # Signature expected by the SQLAdmin implementation
    """Override of the default admin dashboard logout route to unset the authentication cookie."""
    response = RedirectResponse(url=frontend_auth_router.url_path_for("index"), status_code=302)
    response.delete_cookie(
        key=cookie_transport.cookie_name, domain=cookie_transport.cookie_domain, path=cookie_transport.cookie_path
    )
    return response
