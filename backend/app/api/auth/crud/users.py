"""Custom CRUD operations for the User model, on top of the standard FastAPI-Users implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request
from pydantic import EmailStr, ValidationError
from sqlalchemy import exists, select

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.schemas import (
    OrganizationCreate,
    UserCreate,
    UserCreateWithOrganization,
    UserUpdate,
)
from app.api.common.crud.query import require_model

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.services.email_checker import EmailChecker
    from app.api.auth.services.user_database import UserDatabaseAsync


## Create User ##
async def validate_user_create(
    user_db: UserDatabaseAsync,
    user_create: UserCreate | UserCreateWithOrganization,
    email_checker: EmailChecker | None = None,
) -> UserCreate:
    """Override of base user creation with additional username uniqueness check.

    Meant for use within the on_after_register event in FastAPI-Users UserManager.
    """
    if email_checker and await email_checker.is_disposable(user_create.email):
        raise DisposableEmailError(email=user_create.email)

    if user_create.username is not None:
        query = select(exists().where(User.username == user_create.username))
        if (await user_db.session.execute(query)).scalar_one():
            raise UserNameAlreadyExistsError(user_create.username)

    if isinstance(user_create, UserCreateWithOrganization):
        # Validate organization data
        try:
            OrganizationCreate.model_validate(user_create.organization)
        except ValidationError as e:
            err_msg = f"Invalid organization data: {e}"
            raise ValueError(err_msg) from e

        # Turn UserCreateWithOrganization into UserCreate (organization is created after user creation)
        user_create = UserCreate(**user_create.model_dump(exclude={"organization"}), organization_id=None)

    elif user_create.organization_id:
        # Validate organization ID (will raise ValueError if not found)
        await require_model(user_db.session, Organization, user_create.organization_id)

    return user_create


async def add_user_role_in_organization_after_registration(
    user_db: UserDatabaseAsync, user: User, registration_request: Request
) -> User:
    """Add user to an organization after registration.

    Meant for use within the on_after_register event in FastAPI-Users UserManager.
    Validation of organization data is performed in validate_user_create.
    """
    user_create_data = await registration_request.json()

    if organization_data := user_create_data.get("organization"):
        # Create organization
        organization = Organization(**organization_data, owner_id=user.id)
        user_db.session.add(organization)
        await user_db.session.flush()

        # Set user as organization owner
        user.organization_id = organization.id
        user.organization_role = OrganizationRole.OWNER

    elif organization_id := user_create_data.get("organization_id"):
        # User was added to an existing organization
        user.organization_id = organization_id
        user.organization_role = OrganizationRole.MEMBER

    else:
        return user

    user_db.session.add(user)
    await user_db.session.commit()
    await user_db.session.refresh(user)
    return user


## Read User ##
async def get_user_by_username(session: AsyncSession, username: str) -> User:
    """Get a user by their username."""
    statement = select(User).where(User.username == username)

    if not (user := (await session.execute(statement)).scalars().unique().one_or_none()):
        err_msg: EmailStr = f"User not found with username: {username}"

        raise ValueError(err_msg)
    return user


## Update User ##
async def update_user_override(user_db: UserDatabaseAsync, user: User, user_update: UserUpdate) -> UserUpdate:
    """Override base user update with organization validation."""
    if user_update.username is not None:
        # Check username uniqueness
        query = select(exists().where((User.username == user_update.username) & (User.id != user.id)))
        if (await user_db.session.execute(query)).scalar_one():
            raise UserNameAlreadyExistsError(user_update.username)

    if user_update.organization_id is not None:
        # Validate organization exists
        await require_model(user_db.session, Organization, user_update.organization_id)

    # Merge preferences (shallow) instead of replacing the whole dict
    if user_update.preferences is not None:
        merged = {**(user.preferences or {}), **user_update.preferences}
        user_update.preferences = merged

    return user_update
