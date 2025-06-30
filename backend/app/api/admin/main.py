"""SQLAdmin module for the FastAPI app."""

from fastapi import FastAPI
from sqladmin import Admin
from sqlalchemy import Engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from starlette.applications import Starlette
from starlette.routing import Mount, Route

from app.api.admin.auth import get_authentication_backend, logout_override
from app.api.admin.config import settings
from app.api.admin.models import (
    CategoryAdmin,
    ImageAdmin,
    MaterialAdmin,
    MaterialProductLinkAdmin,
    ProductAdmin,
    ProductTypeAdmin,
    TaxonomyAdmin,
    UserAdmin,
    VideoAdmin,
)


def init_admin(app: FastAPI, engine: Engine | AsyncEngine) -> Admin:
    """Initialize the SQLAdmin interface for the FastAPI app.

    Args:
        app (FastAPI): Main FastAPI application instance
        engine (Engine | AsyncEngine): SQLAlchemy database engine, sync or async
    """
    admin = Admin(app, engine, authentication_backend=get_authentication_backend(), base_url=settings.admin_base_url)

    # HACK: Override SQLAdmin logout route to allow cookie-based auth
    for route in admin.app.routes:
        # Find the mounted SQLAdmin app
        if isinstance(route, Mount) and route.path == settings.admin_base_url and isinstance(route.app, Starlette):
            for subroute in route.app.routes:
                # Find the logout subroute and replace it with the custom override to allow cookie-based auth
                if isinstance(subroute, Route) and subroute.name == "logout":
                    route.routes.remove(subroute)
                    route.app.add_route(
                        subroute.path,
                        logout_override,
                        methods=list(subroute.methods) if subroute.methods is not None else None,
                        name="logout",
                    )
                    break
            break

    # Add Background Data views to Admin interface
    admin.add_view(CategoryAdmin)
    admin.add_view(MaterialAdmin)
    admin.add_view(ProductTypeAdmin)
    admin.add_view(TaxonomyAdmin)
    # Add Data Collection views to Admin interface
    admin.add_view(MaterialProductLinkAdmin)
    admin.add_view(ImageAdmin)
    admin.add_view(ProductAdmin)
    admin.add_view(VideoAdmin)

    # Add other admin views
    admin.add_view(UserAdmin)

    return admin
