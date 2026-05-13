"""FastAPI dependencies for the auth module."""

from typing import Annotated

from fastapi import Depends, Security
from pydantic import UUID4

from app.api.auth.models import User
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager, get_user_db, get_user_manager
from app.api.common.exceptions import ForbiddenError

# Dependencies
current_active_user = fastapi_user_manager.current_user(active=True)
current_active_verified_user = fastapi_user_manager.current_user(active=True, verified=True)
current_active_superuser = fastapi_user_manager.current_user(active=True, superuser=True)
optional_current_active_user = fastapi_user_manager.current_user(optional=True)


def current_mfa_user(user: Annotated[User, Security(current_active_user)]) -> User:
    """Require an active user account with MFA enabled."""
    if not user.mfa_enabled:
        message = "MFA is required for this action."
        raise ForbiddenError(message)
    return user


# Annotated dependency types. For example usage, see the `authenticated_route` function in the auth.routers module.
UserDBDep = Annotated[UserDatabaseAsync[User, UUID4], Depends(get_user_db)]
UserManagerDep = Annotated[UserManager, Depends(get_user_manager)]
CurrentActiveUserDep = Annotated[User, Security(current_active_user)]
CurrentActiveVerifiedUserDep = Annotated[User, Security(current_active_verified_user)]
CurrentActiveSuperUserDep = Annotated[User, Security(current_active_superuser)]
CurrentMfaUserDep = Annotated[User, Security(current_mfa_user)]
OptionalCurrentActiveUserDep = Annotated[User | None, Security(optional_current_active_user)]
