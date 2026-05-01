"""Authentication and authorization routers."""

from .admin import all_routers as admin_routers
from .auth import router as auth_router
from .frontend import router as frontend_router
from .oauth import router as oauth_router
from .oauth_token import router as oauth_token_router
from .users import public_profile_router
from .users import router as user_router

all_routers = [
    auth_router,
    frontend_router,
    oauth_router,
    oauth_token_router,
    user_router,
    public_profile_router,
    *admin_routers,
]
