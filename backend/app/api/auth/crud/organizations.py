"""CRUD operations for organizations."""

from pydantic import UUID4
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.exceptions import (
    AlreadyMemberError,
    OrganizationHasMembersError,
    OrganizationNameExistsError,
    UserDoesNotOwnOrgError,
    UserHasNoOrgError,
    UserIsNotMemberError,
    UserOwnsOrgError,
)
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.schemas import OrganizationCreate, OrganizationUpdate
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists

### Constants ###
UNIQUE_VIOLATION_PG_CODE = "23505"


## Create Organization ##
async def create_organization(db: AsyncSession, organization: OrganizationCreate, owner: User) -> Organization:
    """Create a new organization in the database."""
    if owner.organization_id:
        raise AlreadyMemberError(details="Leave your current organization before creating a new one.")

    # Create organization
    db_organization = Organization(
        **organization.model_dump(),
        owner_id=owner.id,
    )
    # Set owner role
    owner.organization_id = db_organization.id
    owner.organization_role = OrganizationRole.OWNER

    try:
        db.add(db_organization)
        await db.flush()
    except IntegrityError as e:
        # TODO: Reuse this in general exception handling
        if getattr(e.orig, "pgcode", None) == UNIQUE_VIOLATION_PG_CODE:
            raise OrganizationNameExistsError from e
        err_msg = f"Error creating organization: {e}"
        raise RuntimeError(err_msg) from e

    db.add(owner)
    await db.commit()
    await db.refresh(db_organization)

    return db_organization


## Read Organization ##
async def get_user_organization(user: User) -> Organization:
    """Get the organization of a user, optionally including related models."""
    if not user.organization:
        raise UserHasNoOrgError
    return user.organization


## Update Organization ##
async def update_user_organization(
    db: AsyncSession, db_organization: Organization, organization_in: OrganizationUpdate
) -> Organization:
    """Update an existing organization in the database."""
    # Update organization data
    db_organization.sqlmodel_update(organization_in.model_dump(exclude_unset=True))

    try:
        db.add(db_organization)
        await db.flush()
    except IntegrityError as e:
        # TODO: Reuse this in general exception handling
        if getattr(e.orig, "pgcode", None) == UNIQUE_VIOLATION_PG_CODE:
            raise OrganizationNameExistsError from e
        err_msg = f"Error updating organization: {e}"
        raise RuntimeError(err_msg) from e

    # Save to database
    await db.commit()
    await db.refresh(db_organization)

    return db_organization


## Delete Organization ##
async def delete_organization_as_owner(db: AsyncSession, owner: User) -> None:
    """Delete a organization from the database, if the user is the owner."""
    # Validate ownership
    db_organization = owner.organization
    if not db_organization or owner.organization_role != OrganizationRole.OWNER:
        raise UserDoesNotOwnOrgError

    if len(db_organization.members) > 1:
        raise OrganizationHasMembersError

    await db.delete(db_organization)
    await db.commit()


async def force_delete_organization(db: AsyncSession, organization_id: UUID4) -> None:
    """Force delete a organization from the database."""
    db_organization = await db_get_model_with_id_if_it_exists(db, Organization, organization_id)

    await db.delete(db_organization)
    await db.commit()


## Organization member CRUD operations ##
async def user_join_organization(
    db: AsyncSession,
    organization: Organization,
    user: User,
) -> User:
    """Add user to organization as member."""
    # Check if user already owns an organization
    # TODO: Implement logic for owners to delegate ownership, or delete organization if it has no members
    if user.organization_id:
        if user.organization_role == OrganizationRole.OWNER:
            raise UserOwnsOrgError(
                details=" You cannot join another organization until you transfer ownership or remove all members."
            )
        raise AlreadyMemberError(details="Leave your current organization before joining a new one.")

    # Update user
    user.organization_id = organization.id
    user.organization_role = OrganizationRole.MEMBER

    db.add(user)
    await db.commit()
    await db.refresh(organization)

    return user


async def get_organization_members(db: AsyncSession, organization_id: UUID4, user: User) -> list[User]:
    """Get organization members if user is a member or superuser."""
    # Verify user is member or superuser
    if not user.is_superuser and user.organization_id != organization_id:
        raise UserIsNotMemberError

    organization = await get_model_by_id(db, Organization, organization_id, include_relationships={"members"})

    # TODO: Add pagination when there are many members
    return organization.members


async def leave_organization(db: AsyncSession, user: User) -> User:
    """Leave current organization."""
    if not user.organization_id:
        raise UserHasNoOrgError
    if user.organization_role == OrganizationRole.OWNER:
        raise UserOwnsOrgError(details=" You cannot leave this organization until you transfer ownership.")

    user.organization_id = None
    user.organization_role = None

    db.add(user)
    await db.commit()

    return user
