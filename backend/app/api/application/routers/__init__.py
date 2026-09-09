"""Routers for the cross-context use cases."""

from .account_erasure import router as account_erasure_router
from .public_profile import router as public_profile_router

all_routers = [
    public_profile_router,
    account_erasure_router,
]
