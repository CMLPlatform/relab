"""Admin routes for managing users."""

from typing import Annotated, cast

from fastapi import APIRouter, Path, Security
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4

from app.api.auth.dependencies import UserManagerDep, current_active_superuser
from app.api.auth.examples import ADMIN_USERS_RESPONSE_EXAMPLES
from app.api.auth.filters import UserFilter
from app.api.auth.models import User
from app.api.auth.schemas import UserRead
from app.api.common.crud.query import page_models
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])


## GET ##
@router.get(
    "",
    summary="View all users",
    response_model=Page[UserRead],
    responses={
        200: {
            "description": "List of users",
            "content": {
                "application/json": {"examples": ADMIN_USERS_RESPONSE_EXAMPLES},
            },
        },
    },
)
async def get_users(
    user_filter: Annotated[UserFilter, FilterDepends(UserFilter)],
    session: AsyncSessionDep,
) -> Page[UserRead]:
    """Get a list of all users with optional filtering."""
    return cast(
        "Page[UserRead]",
        await page_models(session, User, filters=user_filter, read_schema=UserRead),
    )


@router.get(
    "/{user_id}",
    summary="View a single user by ID",
    response_model=UserRead,
)
async def get_user(
    user_id: Annotated[UUID4, Path(description="The user's ID")],
    user_manager: UserManagerDep,
) -> User:
    """Get a user by ID."""
    user: User = await user_manager.get(user_id)

    return user


## DELETE ##
@router.delete(
    "/{user_id}",
    summary="Delete a user by ID",
    status_code=204,
)
async def delete_user(
    user_id: Annotated[UUID4, Path(description="The user's ID")],
    user_manager: UserManagerDep,
) -> None:
    """Delete a user by ID."""
    user = await user_manager.get(user_id)
    await user_manager.delete(user)
