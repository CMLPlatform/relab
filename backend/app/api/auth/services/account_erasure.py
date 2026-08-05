"""Administrative account erasure with a per-deletion content policy.

Deleting a user always erases their personal data. What happens to the research
data they contributed is the admin's choice at deletion time:

- ``anonymize`` (default) reassigns their products to a dedicated, permanently
  inactive system account, so published research data survives the account.
- ``delete`` removes the owned product subtrees, their media rows, and the bytes.

Cameras and OAuth links are personal data and are always hard-deleted.
"""

import logging
import secrets
from typing import TYPE_CHECKING, Literal

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.auth.models import User
from app.api.auth.services.email_identity import canonicalize_email
from app.api.auth.services.password_hashing import build_password_helper
from app.api.common.audit import AuditAction, audit_event
from app.api.common.crud.query import require_model
from app.api.common.exceptions import ConflictError
from app.api.data_collection.crud.product_commands import delete_product
from app.api.data_collection.crud.profile_stats import recompute_user_profile_stats
from app.api.data_collection.crud.storage import cleanup_product_media_storage
from app.api.data_collection.models.product import Product
from app.api.file_storage.upload_quota import recompute_user_upload_quota
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.runtime.preview import get_preview_thumbnail_path, remove_preview_thumbnail

if TYPE_CHECKING:
    from pathlib import Path

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.data_collection.crud.storage import ProductMediaStorageCleanup

logger = logging.getLogger(__name__)

type ErasureContent = Literal["anonymize", "delete"]
ANONYMIZE: ErasureContent = "anonymize"

# Non-deliverable address for the account that owns anonymized content, so products
# keep a NOT NULL owner_id without naming a person. NOTE: the `.internal` suffix is
# deliberate — `.invalid` is rejected outright by email-validator, which would make
# `UserRead.email` (EmailStr) unserializable and break the admin user list as soon as
# this account exists.
ANONYMOUS_USER_EMAIL = "anonymous@system.relab.internal"


async def get_or_create_anonymous_user(session: AsyncSession) -> User:
    """Return the system account that owns anonymized content, creating it on first use.

    Never usable as a login: inactive, unverified, and holding a hash of a random
    secret nobody knows.
    """
    lookup = select(User).where(User.email_canonical == canonicalize_email(ANONYMOUS_USER_EMAIL))
    if (existing := (await session.execute(lookup)).scalars().unique().one_or_none()) is not None:
        return existing

    anonymous = User(
        email=ANONYMOUS_USER_EMAIL,
        hashed_password=build_password_helper().hash(secrets.token_urlsafe(32)),
        has_usable_password=False,
        is_active=False,
        is_verified=False,
        is_superuser=False,
    )
    try:
        async with session.begin_nested():
            session.add(anonymous)
            await session.flush()
    except IntegrityError:
        # A concurrent erasure won the insert; take its row.
        return (await session.execute(lookup)).scalars().unique().one()
    return anonymous


async def erase_user(session: AsyncSession, user: User, *, content: ErasureContent = ANONYMIZE) -> None:
    """Erase a user account, applying the chosen policy to the content they own.

    Raises:
        ConflictError: when the target is the anonymous system account or the last
            active superuser.
    """
    db_user = await require_erasable_account(session, user)
    user_id = db_user.id

    pending_media: list[ProductMediaStorageCleanup] = []
    deleted_product_ids: list[int] = []

    if content == ANONYMIZE:
        anonymous = await get_or_create_anonymous_user(session)
        # owner_id is denormalized onto every row of a product subtree, so a flat
        # update by owner covers base products and their components alike.
        await session.execute(update(Product).where(Product.owner_id == user_id).values(owner_id=anonymous.id))
    else:
        anonymous = None
        pending_media, deleted_product_ids = await _delete_owned_products(session, user_id)

    thumbnails = await _delete_owned_cameras(session, user_id)

    # OAuth links follow the user row through the delete-orphan cascade.
    await session.delete(db_user)
    await session.flush()

    if anonymous is not None:
        await recompute_user_upload_quota(session, user_id=anonymous.id)
        await recompute_user_profile_stats(session, anonymous.id)

    await session.commit()

    for product_id in deleted_product_ids:
        audit_event(user_id, AuditAction.DELETE, Product, product_id)

    # Bytes only after the rows are durably gone, mirroring product deletion.
    await cleanup_product_media_storage(pending_media)
    for path in thumbnails:
        remove_preview_thumbnail(path)


async def require_erasable_account(session: AsyncSession, user: User) -> User:
    """Return the session-bound user, refusing accounts the platform cannot function without.

    Callers with side effects of their own (session revocation) run this first, so a
    rejected erasure leaves nothing behind.

    Raises:
        ConflictError: when the target is the anonymous system account or the last
            active superuser.
    """
    # The caller's instance may belong to another session (the auth dependency chain
    # opens its own), so re-resolve it against the session doing the writes.
    user = await require_model(session, User, user.id)

    if user.email_canonical == canonicalize_email(ANONYMOUS_USER_EMAIL):
        msg = "The anonymous system account cannot be deleted."
        raise ConflictError(msg)

    if not (user.is_superuser and user.is_active):
        return user

    # Locked, so two concurrent deletions cannot each see the other as "remaining".
    other_superuser = await session.execute(
        select(User.id)
        .where(User.is_superuser.is_(True), User.is_active.is_(True), User.id != user.id)
        .with_for_update()
        .limit(1)
    )
    if other_superuser.first() is None:
        msg = "The last active superuser cannot be deleted."
        raise ConflictError(msg)
    return user


async def _delete_owned_products(
    session: AsyncSession, user_id: UUID4
) -> tuple[list[ProductMediaStorageCleanup], list[int]]:
    """Delete every base product the user owns, subtrees and media included.

    Returns the storage cleanups to run after the caller's commit, and the deleted
    product ids to audit once that commit is durable.
    """
    base_product_ids = (
        (await session.execute(select(Product.id).where(Product.owner_id == user_id, Product.parent_id.is_(None))))
        .scalars()
        .all()
    )
    pending_media: list[ProductMediaStorageCleanup] = []
    for product_id in base_product_ids:
        pending_media += await delete_product(session, product_id, commit=False)
    return pending_media, list(base_product_ids)


async def _delete_owned_cameras(session: AsyncSession, user_id: UUID4) -> list[Path]:
    """Delete the user's cameras, returning their preview thumbnails for post-commit cleanup."""
    cameras = (await session.execute(select(Camera).where(Camera.owner_id == user_id))).scalars().all()
    thumbnails = [get_preview_thumbnail_path(camera.id) for camera in cameras]
    for camera in cameras:
        await session.delete(camera)
    return thumbnails
