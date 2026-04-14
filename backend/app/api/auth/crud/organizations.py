"""CRUD operations for organizations."""

from typing import TYPE_CHECKING, cast

from pydantic import UUID4, BaseModel
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import (
    AlreadyMemberError,
    OrganizationHasMembersError,
    UserDoesNotOwnOrgError,
    UserHasNoOrgError,
    UserIsNotMemberError,
    UserOwnsOrgError,
    handle_organization_integrity_error,
)
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.schemas import OrganizationCreate, OrganizationUpdate
from app.api.common.crud.persistence import commit_and_refresh, delete_and_commit
from app.api.common.crud.query import page_models, require_model
from app.api.common.exceptions import InternalServerError

if TYPE_CHECKING:
    from fastapi_filter.contrib.sqlalchemy import Filter
    from fastapi_pagination import Page

### Constants ###
OWNER_ID_FIELD = "owner_id"


## Create Organization ##
async def create_organization(db: AsyncSession, organization: OrganizationCreate, owner: User) -> Organization:
    """Create a new organization in the database."""
    if owner.organization_id:
        raise AlreadyMemberError(details="Leave your current organization before creating a new one.")
    if owner.id is None:
        err_msg = "Organization owner must have a persisted ID."
        raise InternalServerError(details=err_msg, log_message=err_msg)

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
        handle_organization_integrity_error(e, "creating")

    db.add(owner)
    return await commit_and_refresh(db, db_organization, add_before_commit=False)


## Read Organization ##
async def get_organizations(
    db: AsyncSession,
    *,
    loaders: set[str] | None = None,
    filters: Filter | None = None,
    read_schema: type[BaseModel] | None = None,
) -> Page[Organization]:
    """Get organizations with optional filtering, relationships, and pagination."""
    return await page_models(
        db,
        Organization,
        loaders=loaders,
        filters=filters,
        read_schema=read_schema,
    )


## Update Organization ##
async def update_user_organization(
    db: AsyncSession, db_organization: Organization, organization_in: OrganizationUpdate
) -> Organization:
    """Update an existing organization in the database."""
    transfer_owner_id = organization_in.owner_id if OWNER_ID_FIELD in organization_in.model_fields_set else None
    if transfer_owner_id is not None:
        db_organization = await require_model(
            db,
            Organization,
            db_organization.id,
            loaders={"members", "owner"},
        )
        new_owner = next((member for member in db_organization.members if member.id == transfer_owner_id), None)
        if new_owner is None:
            raise UserIsNotMemberError(
                organization_id=db_organization.id,
                details="Ownership can only be transferred to an existing member.",
            )

    # Update organization data without clobbering ownership transfer logic.
    for key, value in organization_in.model_dump(exclude_unset=True, exclude={"owner_id"}).items():
        setattr(db_organization, key, value)

    if transfer_owner_id is not None and transfer_owner_id != db_organization.owner_id:
        current_owner = db_organization.owner
        new_owner = next((member for member in db_organization.members if member.id == transfer_owner_id), None)
        if new_owner is None:
            raise UserIsNotMemberError(
                organization_id=db_organization.id,
                details="Ownership can only be transferred to an existing member.",
            )

        current_owner.organization_role = OrganizationRole.MEMBER
        new_owner.organization_role = OrganizationRole.OWNER
        db_organization.owner_id = new_owner.id

    try:
        db.add(db_organization)
        await db.flush()
    except IntegrityError as e:
        handle_organization_integrity_error(e, "updating")

    return await commit_and_refresh(db, db_organization, add_before_commit=False)


## Delete Organization ##
async def delete_organization_as_owner(db: AsyncSession, owner: User) -> None:
    """Delete a organization from the database, if the user is the owner."""
    # Validate ownership
    db_organization = owner.organization
    if not db_organization or owner.organization_role != OrganizationRole.OWNER:
        raise UserDoesNotOwnOrgError

    if len(db_organization.members) > 1:
        raise OrganizationHasMembersError

    await delete_and_commit(db, db_organization)


async def force_delete_organization(db: AsyncSession, organization_id: UUID4) -> None:
    """Force delete a organization from the database."""
    db_organization = await require_model(db, Organization, organization_id)

    await delete_and_commit(db, db_organization)


## Organization member CRUD operations ##
async def user_join_organization(
    db: AsyncSession,
    organization: Organization,
    user: User,
) -> User:
    """Add user to organization as member."""
    # Check if user already owns an organization
    if user.organization_id:
        if user.organization_role == OrganizationRole.OWNER:
            db_organization = user.organization
            if db_organization is None or db_organization.id != user.organization_id:
                db_organization = await require_model(
                    db,
                    Organization,
                    user.organization_id,
                    loaders={"members"},
                )

            if len(db_organization.members) > 1:
                raise UserOwnsOrgError(
                    details=" You cannot join another organization until you transfer ownership or remove all members."
                )

            # The owner is the only member, so we can delete the empty organization first.
            user.organization_id = None
            user.organization_role = None
            user.organization = None
            db.add(user)
            await db.flush()
            await db.execute(delete(Organization).where(Organization.id == db_organization.id))
        else:
            raise AlreadyMemberError(details="Leave your current organization before joining a new one.")

    # Update user
    user.organization_id = organization.id
    user.organization_role = OrganizationRole.MEMBER
    user.organization = organization

    db.add(user)
    await commit_and_refresh(db, organization, add_before_commit=False)

    return user


async def get_organization_members(
    db: AsyncSession,
    organization_id: UUID4,
    user: User,
    *,
    paginate: bool = False,
    read_schema: type[BaseModel] | None = None,
) -> list[User] | Page[User]:
    """Get organization members if user is a member or superuser."""
    # Verify user is member or superuser
    if not user.is_superuser and user.organization_id != organization_id:
        raise UserIsNotMemberError

    if paginate:
        await require_model(db, Organization, organization_id)
        statement = select(User).where(User.organization_id == organization_id)
        return cast(
            "Page[User]",
            await page_models(db, User, statement=statement, read_schema=read_schema),
        )

    organization = await require_model(db, Organization, organization_id, loaders={"members"})

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
