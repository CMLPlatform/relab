"""Authentication and authorization routers."""

from .admin import all_routers as admin_routers
from .auth import router as auth_router
from .frontend import router as frontend_router
from .oauth import router as oauth_router
from .organizations import router as organization_router
from .users import router as user_router

all_routers = [
    auth_router,
    frontend_router,
    organization_router,
    oauth_router,
    user_router,
    *admin_routers,
]
