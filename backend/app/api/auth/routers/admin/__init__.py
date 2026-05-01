"""Admin routers for the auth module."""

from .users import router as user_router

all_routers = [
    user_router,
]
