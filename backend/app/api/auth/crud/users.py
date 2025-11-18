"""Custom CRUD operations for the User model, on top of the standard FastAPI-Users implementation."""

from fastapi import Request
from fastapi_users.db import BaseUserDatabase
from pydantic import UUID4, EmailStr, ValidationError
from sqlalchemy import and_, func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.exceptions import UserNameAlreadyExistsError
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.schemas import (
    OrganizationCreate,
    UserCreate,
    UserCreateWithOrganization,
    UserUpdate,
    UserReadPublic,
)
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists


## Create User ##
async def create_user_override(
    user_db: BaseUserDatabase[User, UUID4], user_create: UserCreate | UserCreateWithOrganization
) -> UserCreate:
    """Override of base user creation with additional username uniqueness check.

    Meant for use within the on_after_register event in FastAPI-Users UserManager.
    """
    # TODO: Fix type errors in this method and implement custom UserNameAlreadyExists error in FastAPI-Users

    if user_create.username is not None:
        query = select(User).where(User.username == user_create.username)
        existing_username = await user_db.session.execute(query)
        if existing_username.unique().scalar_one_or_none():
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
        await db_get_model_with_id_if_it_exists(user_db.session, Organization, user_create.organization_id)

    return user_create


async def add_user_role_in_organization_after_registration(
    user_db: BaseUserDatabase[User, UUID4],
    user: User,
    registration_request: Request,
) -> User:
    """Add user to an organization after registration.

    Meant for use within the on_after_register event in FastAPI-Users UserManager.
    Validation of organization data is performed in create_user_override.
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
async def get_user_by_username(
    session: AsyncSession,
    username: str,
) -> User:
    """Get a user by their username."""
    statement = select(User).where(User.username == username)
    if not (user := (await session.exec(statement)).one_or_none()):
        err_msg: EmailStr = f"User not found with username: {username}"
        raise ValueError(err_msg)
    return user


async def get_user_public_profile(
    session: AsyncSession,
    user_id: UUID4,
) -> UserReadPublic:
    """Get a user's public profile with product count."""
    from app.api.data_collection.models import Product

    # Get user
    statement = select(User).where(User.id == user_id)
    user = (await session.exec(statement)).one_or_none()

    if not user:
        err_msg = f"User not found with ID: {user_id}"
        raise ValueError(err_msg)

    if not user.is_profile_public:
        err_msg = f"User profile is not public"
        raise ValueError(err_msg)

    # Count user's products
    count_statement = select(func.count(Product.id)).where(Product.owner_id == user_id)
    product_count = (await session.exec(count_statement)).one()

    return UserReadPublic(
        id=user.id,
        username=user.username,
        email=user.email,
        is_profile_public=user.is_profile_public,
        created_at=user.created_at,
        product_count=product_count or 0,
    )


async def get_user_products(
    session: AsyncSession,
    user_id: UUID4,
):
    """Get all products owned by a user."""
    from app.api.data_collection.models import Product

    # Verify user exists and profile is public
    statement = select(User).where(User.id == user_id)
    user = (await session.exec(statement)).one_or_none()

    if not user:
        err_msg = f"User not found with ID: {user_id}"
        raise ValueError(err_msg)

    if not user.is_profile_public:
        err_msg = f"User profile is not public"
        raise ValueError(err_msg)

    # Get user's products
    products_statement = select(Product).where(Product.owner_id == user_id)
    products = (await session.exec(products_statement)).all()

    return products


## Update User ##
async def update_user_override(
    user_db: BaseUserDatabase[User, UUID4],
    user: User,
    user_update: UserUpdate,
) -> UserUpdate:
    """Override base user update with organization validation."""
    if user_update.username is not None:
        # Check username uniqueness
        query = select(User).where(and_(User.username == user_update.username, User.id != user.id))
        existing_username = await user_db.session.execute(query)
        if existing_username.scalar_one_or_none():
            raise UserNameAlreadyExistsError(user_update.username)

    if user_update.organization_id is not None:
        # Validate organization exists
        await db_get_model_with_id_if_it_exists(user_db.session, Organization, user_update.organization_id)

    return user_update
