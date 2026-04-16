"""CRUD operations for organizations."""

from typing import TYPE_CHECKING, cast

from pydantic import UUID4, BaseModel
from sqlalchemy import Select, delete, select
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
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.persistence import commit_and_refresh, delete_and_commit
from app.api.common.crud.query import require_model
from app.api.common.exceptions import InternalServerError

if TYPE_CHECKING:
    from fastapi_filter.contrib.sqlalchemy import Filter
    from fastapi_pagination import Page

### Constants ###
OWNER_ID_FIELD = "owner_id"


def _organization_statement(
    *,
    loaders: set[str] | None = None,
    filters: Filter | None = None,
    read_schema: type[BaseModel] | None = None,
) -> Select[tuple[Organization]]:
    """Build the shared organization-listing query."""
    statement: Select[tuple[Organization]] = select(Organization)
    statement = apply_filter(statement, Organization, filters)
    return cast(
        "Select[tuple[Organization]]",
        apply_loader_profile(statement, Organization, loaders, read_schema=read_schema),
    )


def _organization_members_statement(organization_id: UUID4) -> Select[tuple[User]]:
    """Build the organization-members query."""
    return select(User).where(User.organization_id == organization_id)


async def get_organization(
    db: AsyncSession,
    organization_id: UUID4,
    *,
    loaders: set[str] | None = None,
    read_schema: type[BaseModel] | None = None,
) -> Organization:
    """Load one organization with optional relationships."""
    return await require_model(db, Organization, organization_id, loaders=loaders, read_schema=read_schema)


async def _load_org_for_transfer(db: AsyncSession, organization_id: UUID4) -> Organization:
    """Load an organization with members and owner for ownership transfer flows."""
    return await get_organization(db, organization_id, loaders={"members", "owner"})


async def _require_joinable_current_owner_org(db: AsyncSession, user: User) -> Organization:
    """Load the organization currently owned by the user during join flows."""
    db_organization = user.organization
    if db_organization is None or db_organization.id != user.organization_id:
        if user.organization_id is None:
            err_msg = "Owned organization must exist before loading it during join flow."
            raise InternalServerError(details=err_msg, log_message=err_msg)
        return await get_organization(
            db,
            user.organization_id,
            loaders={"members"},
        )
    return db_organization


async def _delete_empty_owned_organization_for_join(db: AsyncSession, user: User) -> None:
    """Delete a user's current organization when they are its last remaining owner/member."""
    if user.organization_id is None:
        err_msg = "Owned organization must exist before deleting it during join flow."
        raise InternalServerError(details=err_msg, log_message=err_msg)

    db_organization = await _require_joinable_current_owner_org(db, user)
    if len(db_organization.members) > 1:
        raise UserOwnsOrgError(
            details=" You cannot join another organization until you transfer ownership or remove all members."
        )

    user.organization_id = None
    user.organization_role = None
    user.organization = None
    db.add(user)
    await db.flush()
    await db.execute(delete(Organization).where(Organization.id == db_organization.id))


def _require_transfer_member(db_organization: Organization, transfer_owner_id: UUID4) -> User:
    """Return the transfer target when it is already an organization member."""
    new_owner = next((member for member in db_organization.members if member.id == transfer_owner_id), None)
    if new_owner is None:
        raise UserIsNotMemberError(
            organization_id=db_organization.id,
            details="Ownership can only be transferred to an existing member.",
        )
    return new_owner


def _apply_organization_updates(db_organization: Organization, organization_in: OrganizationUpdate) -> None:
    """Apply non-ownership organization updates."""
    for key, value in organization_in.model_dump(exclude_unset=True, exclude={OWNER_ID_FIELD}).items():
        setattr(db_organization, key, value)


def _transfer_organization_ownership(db_organization: Organization, *, new_owner: User) -> None:
    """Transfer ownership from the current owner to an existing member."""
    current_owner = db_organization.owner
    current_owner.organization_role = OrganizationRole.MEMBER
    new_owner.organization_role = OrganizationRole.OWNER
    db_organization.owner_id = new_owner.id


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
    statement = _organization_statement(loaders=loaders, filters=filters, read_schema=read_schema)
    return cast("Page[Organization]", await paginate_select(db, statement, model=Organization))


async def page_organization_members(
    db: AsyncSession,
    organization_id: UUID4,
    *,
    read_schema: type[BaseModel] | None = None,
) -> Page[User]:
    """Get organization members in a paginated response."""
    statement = _organization_members_statement(organization_id)
    statement = cast("Select[tuple[User]]", apply_loader_profile(statement, User, read_schema=read_schema))
    return cast("Page[User]", await paginate_select(db, statement, model=User))


## Update Organization ##
async def update_user_organization(
    db: AsyncSession, db_organization: Organization, organization_in: OrganizationUpdate
) -> Organization:
    """Update an existing organization in the database."""
    transfer_owner_id = organization_in.owner_id if OWNER_ID_FIELD in organization_in.model_fields_set else None
    if transfer_owner_id is not None:
        db_organization = await _load_org_for_transfer(db, db_organization.id)

    _apply_organization_updates(db_organization, organization_in)

    if transfer_owner_id is not None and transfer_owner_id != db_organization.owner_id:
        new_owner = _require_transfer_member(db_organization, transfer_owner_id)
        _transfer_organization_ownership(db_organization, new_owner=new_owner)

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
    db_organization = await get_organization(db, organization_id)

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
            await _delete_empty_owned_organization_for_join(db, user)
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
        await get_organization(db, organization_id)
        return await page_organization_members(db, organization_id, read_schema=read_schema)

    organization = await get_organization(db, organization_id, loaders={"members"})

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
