"""Admin routes for managing users."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Path, Query, Security
from fastapi.responses import RedirectResponse
from fastapi_filter import FilterDepends
from pydantic import UUID4, EmailStr

from app.api.auth.crud import get_user_by_username
from app.api.auth.dependencies import UserManagerDep, current_active_superuser
from app.api.auth.filters import UserFilter
from app.api.auth.models import User
from app.api.auth.routers.users import router as public_user_router
from app.api.auth.schemas import UserRead, UserReadWithRelationships
from app.api.common.crud.base import get_models
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])


## GET ##
@router.get(
    "",
    summary="View all users",
    response_model=list[UserRead] | list[UserReadWithRelationships],
    responses={
        200: {
            "description": "List of users",
            "content": {
                "application/json": {
                    "examples": {
                        "basic": {
                            "summary": "Users without relationships",
                            "value": [
                                {
                                    "id": "12345678-cc4e-405c-8553-7806424de2a1",
                                    "username": "alice",
                                    "email": "alice@example.com",
                                    "is_active": True,
                                    "is_superuser": False,
                                    "is_verified": True,
                                }
                            ],
                        },
                        "with_organization": {
                            "summary": "Users with organization",
                            "value": [
                                {
                                    "id": "12345678-cc4e-405c-8553-7806424de2a1",
                                    "username": "alice",
                                    "email": "alice@example.com",
                                    "is_active": True,
                                    "is_superuser": False,
                                    "is_verified": True,
                                    "organization": {
                                        "id": "12345678-cc4e-405c-8553-7806424de2a1",
                                        "name": "University of Example",
                                        "location": "Example City",
                                        "description": "Example organization",
                                    },
                                },
                            ],
                        },
                    }
                },
            },
        },
    },
)
async def get_users(
    user_filter: Annotated[UserFilter, FilterDepends(UserFilter)],
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "products": {"value": ["products"]},
                "all": {"value": ["products", "organization"]},
            },
        ),
    ] = None,
) -> Sequence[User]:
    """Get a list of all users with optional filtering and relationships."""
    return await get_models(session, User, include_relationships=include, model_filter=user_filter)


@router.get(
    "/{user_id}",
    summary="View a single user by ID",
    response_model=UserReadWithRelationships,
)
async def get_user(
    user_id: Annotated[UUID4, Path(description="The user's ID")],
    user_manager: UserManagerDep,
) -> User:
    """Get a user by ID."""
    user: User = await user_manager.get(user_id)

    return user


@router.get(
    "/by-email/{email}",
    summary="View a single user by email",
    response_class=RedirectResponse,
    status_code=307,
)
async def get_by_email(
    email: EmailStr,
    user_manager: UserManagerDep,
) -> RedirectResponse:
    """Get a user by email and redirect to their profile page."""
    user: User = await user_manager.get_by_email(email)

    get_user_by_id_url = public_user_router.url_path_for("get_user", user_id=user.id)
    return RedirectResponse(get_user_by_id_url)


@router.get(
    "/by-username/{username}",
    summary="View a single user by username",
    response_class=RedirectResponse,
    status_code=307,
)
async def get_by_username(
    username: Annotated[str, Path(min_length=2, max_length=50)],
    session: AsyncSessionDep,
) -> RedirectResponse:
    """Get a user by username and redirect to their profile page."""
    user: User = await get_user_by_username(session, username)

    get_user_by_id_url = public_user_router.url_path_for("get_user", user_id=user.id)
    return RedirectResponse(get_user_by_id_url)


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
