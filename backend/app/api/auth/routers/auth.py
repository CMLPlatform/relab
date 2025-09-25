"""Authentication, registration, and login routes."""

from fastapi import APIRouter

from app.api.auth.schemas import UserCreate, UserCreateWithOrganization, UserRea
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend, fastapi_user_manager
from app.api.common.routers.openapi import mark_router_routes_public

router = APIRouter(prefix="/auth", tags=["auth"])

# Basic authentication routes
router.include_router(fastapi_user_manager.get_auth_router(bearer_auth_backend), prefix="/bearer")
router.include_router(fastapi_user_manager.get_auth_router(cookie_auth_backend), prefix="/cookie")

# Mark all routes in the auth router thus far as public
mark_router_routes_public(router)

# Registration, verification, and password reset routes
# TODO: Write custom register router for custom exception handling and use UserReadPublic schema for responses
# This will make the on_after_register and custom create methods in the user manager unnecessary.

# TODO: Include below routers when launching publicly
router.include_router(
    fastapi_user_manager.get_register_router(
        UserRead,
        UserCreate | UserCreateWithOrganization,  # TODO: Investigate this type error
    ),
)

router.include_router(
    fastapi_user_manager.get_verify_router(user_schema=UserRead),
)
router.include_router(
    fastapi_user_manager.get_reset_password_router(),
)
