"""FastAPI dependencies for the auth module."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path, Security, status
from fastapi_users.exceptions import InvalidID, UserNotExists
from pydantic import UUID4

from app.api.auth.models import User
from app.api.auth.roles import UserRole, has_role_at_least
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager, get_user_db, get_user_manager
from app.api.common.exceptions import ForbiddenError

# Dependencies
current_active_user = fastapi_user_manager.current_user(active=True)
current_active_verified_user = fastapi_user_manager.current_user(active=True, verified=True)
current_active_superuser = fastapi_user_manager.current_user(active=True, superuser=True)
# active=True so a since-deactivated account with a still-valid access token is
# treated as anonymous, not as an authenticated viewer. Every other dep here
# already sets it; without it a deactivated (super)user keeps profile-visibility
# rights until the token expires.
optional_current_active_user = fastapi_user_manager.current_user(optional=True, active=True)


def current_lab_user(user: Annotated[User, Security(current_active_verified_user)]) -> User:
    """Require an active, verified account at the ``lab`` tier or above.

    Built on the verified dep rather than beside it, so a lab-gated route keeps
    every guarantee the verified one carried.
    """
    if not has_role_at_least(user.role, UserRole.LAB):
        message = "This action is restricted to lab accounts."
        raise ForbiddenError(message)
    return user


def current_mfa_user(user: Annotated[User, Security(current_active_user)]) -> User:
    """Require an active account that has TOTP MFA *enrolled*.

    NOTE: this checks enrolment, not that the current session passed an MFA
    challenge. It is not a step-up gate — do not use it to guard a sensitive
    operation on the assumption the session was MFA-verified.
    """
    if not user.mfa_enabled:
        message = "MFA is required for this action."
        raise ForbiddenError(message)
    return user


# Annotated dependency types. For example usage, see the `authenticated_route` function in the auth.routers module.
UserDBDep = Annotated[UserDatabaseAsync[User, UUID4], Depends(get_user_db)]
UserManagerDep = Annotated[UserManager, Depends(get_user_manager)]


async def get_user_or_404(
    user_id: Annotated[UUID4, Path(description="The user's ID")], user_manager: UserManagerDep
) -> User:
    """Load a user by id, mapping fastapi-users' UserNotExists/InvalidID to 404.

    The admin routes call ``user_manager.get`` directly; without this the
    not-found path escapes to the catch-all handler as a 500.
    """
    try:
        return await user_manager.get(user_id)
    except (UserNotExists, InvalidID) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found") from exc


CurrentActiveUserDep = Annotated[User, Security(current_active_user)]
CurrentActiveVerifiedUserDep = Annotated[User, Security(current_active_verified_user)]
CurrentActiveSuperUserDep = Annotated[User, Security(current_active_superuser)]
CurrentLabUserDep = Annotated[User, Security(current_lab_user)]
CurrentMfaUserDep = Annotated[User, Security(current_mfa_user)]
OptionalCurrentActiveUserDep = Annotated[User | None, Security(optional_current_active_user)]
UserByIDDep = Annotated[User, Depends(get_user_or_404)]
