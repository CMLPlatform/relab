"""Upload quota ledger statements against real rows.

The unit tests only render the SQL; these run it, so a wrong join or filter changes
the numbers a user is charged.
"""

from typing import TYPE_CHECKING

import pytest

from app.api.data_collection.models.product import Product
from app.api.file_storage import upload_quota
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.upload_quota import (
    recompute_user_upload_quota,
    release_product_upload_quota_for_media,
    reserve_product_upload_quota,
)
from scripts.seed.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.db

# A ledger value no recompute or release in these tests can produce by accident.
STALE_COUNT = 99
STALE_BYTES = 9999


async def _user_with_stale_ledger(session: AsyncSession) -> User:
    return await UserFactory.create_async(
        session=session, upload_file_count=STALE_COUNT, upload_total_bytes=STALE_BYTES
    )


async def _product(session: AsyncSession, owner: User) -> Product:
    product = Product(owner_id=owner.id, name="Quota product")
    session.add(product)
    await session.flush()
    return product


def _file(parent_id: int, size: int, parent_type: MediaParentType = MediaParentType.PRODUCT) -> File:
    return File(filename="f.txt", file="f.txt", upload_size_bytes=size, parent_type=parent_type, parent_id=parent_id)


def _image(parent_id: int, size: int, parent_type: MediaParentType = MediaParentType.PRODUCT) -> Image:
    return Image(filename="i.png", file="i.png", upload_size_bytes=size, parent_type=parent_type, parent_id=parent_id)


async def test_recompute_counts_only_the_users_own_product_media(db_session: AsyncSession) -> None:
    """Recompute sums the user's product files and images, and nothing else."""
    owner = await _user_with_stale_ledger(db_session)
    other = await _user_with_stale_ledger(db_session)
    first, second = await _product(db_session, owner), await _product(db_session, owner)
    others_product = await _product(db_session, other)
    db_session.add_all(
        [
            _file(first.id, 10),
            _file(second.id, 20),
            _image(first.id, 300),
            # Another user's product media is charged to them, not to the owner.
            _file(others_product.id, 4000),
            _image(others_product.id, 50000),
            # Reference-data media reusing the product's id belongs to no user.
            _file(first.id, 600000, MediaParentType.MATERIAL),
            _image(first.id, 7000000, MediaParentType.PRODUCT_TYPE),
        ]
    )
    await db_session.flush()

    await recompute_user_upload_quota(db_session, user_id=owner.id)

    await db_session.refresh(owner)
    await db_session.refresh(other)
    assert (owner.upload_file_count, owner.upload_total_bytes) == (3, 330)
    # Only the requested user's ledger is rewritten.
    assert (other.upload_file_count, other.upload_total_bytes) == (STALE_COUNT, STALE_BYTES)


async def test_recompute_resets_a_user_without_media_to_zero(db_session: AsyncSession) -> None:
    """A user with no product media ends with an empty ledger, not a NULL or stale one."""
    user = await _user_with_stale_ledger(db_session)
    await _product(db_session, user)

    await recompute_user_upload_quota(db_session, user_id=user.id)

    await db_session.refresh(user)
    assert (user.upload_file_count, user.upload_total_bytes) == (0, 0)


async def test_release_decrements_only_the_product_owner(db_session: AsyncSession) -> None:
    """Releasing one item takes one file and its bytes off its product owner's ledger only."""
    owner = await _user_with_stale_ledger(db_session)
    other = await _user_with_stale_ledger(db_session)
    product = await _product(db_session, owner)
    await _product(db_session, other)
    item = _file(product.id, 100)
    db_session.add(item)
    await db_session.flush()

    await release_product_upload_quota_for_media(db_session, item)

    await db_session.refresh(owner)
    await db_session.refresh(other)
    assert (owner.upload_file_count, owner.upload_total_bytes) == (STALE_COUNT - 1, STALE_BYTES - 100)
    assert (other.upload_file_count, other.upload_total_bytes) == (STALE_COUNT, STALE_BYTES)


async def test_release_never_takes_the_ledger_below_zero(db_session: AsyncSession) -> None:
    """A ledger already short of the released item clamps at zero instead of going negative."""
    owner = await UserFactory.create_async(session=db_session, upload_file_count=0, upload_total_bytes=50)
    product = await _product(db_session, owner)
    item = _file(product.id, 100)
    db_session.add(item)
    await db_session.flush()

    await release_product_upload_quota_for_media(db_session, item)

    await db_session.refresh(owner)
    assert (owner.upload_file_count, owner.upload_total_bytes) == (0, 0)


async def test_reserve_accepts_an_upload_that_exactly_fills_the_byte_quota(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The byte quota is an inclusive limit: an upload that lands exactly on it is accepted."""
    monkeypatch.setattr(upload_quota, "upload_quota_bytes_for_role", lambda _role: 100)
    owner = await UserFactory.create_async(session=db_session, upload_file_count=0, upload_total_bytes=40)
    product = await _product(db_session, owner)

    await reserve_product_upload_quota(db_session, parent_id=product.id, upload_size_bytes=60)

    await db_session.refresh(owner)
    assert (owner.upload_file_count, owner.upload_total_bytes) == (1, 100)
