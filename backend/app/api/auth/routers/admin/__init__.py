"""Admin routers for the auth module."""

from .organizations import router as organization_router
from .users import router as user_router

all_routers = [
    organization_router,
    user_router,
]
