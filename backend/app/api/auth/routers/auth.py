"""Authentication, registration, and login routes."""

from fastapi import APIRouter
from pydantic import EmailStr

from app.api.auth.schemas import UserCreate, UserCreateWithOrganization, UserRead
from app.api.auth.services.user_manager import bearer_auth_backend, cookie_auth_backend, fastapi_user_manager
from app.api.auth.utils.email_validation import is_disposable_email
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


@router.get("/validate-email")
async def validate_email(email: EmailStr) -> dict:
    """Validate email address for registration."""
    is_disposable = await is_disposable_email(email)

    return {"isValid": not is_disposable, "reason": "Please use a permanent email address" if is_disposable else None}
