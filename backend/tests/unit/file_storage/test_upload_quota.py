"""Tests for Postgres-backed upload quota ledgers."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.auth.roles import UserRole, upload_quota_bytes_for_role, upload_quota_files_for_role
from app.api.common.exceptions import PayloadTooLargeError
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.upload_quota import (
    recompute_user_upload_quota,
    release_product_upload_quota_for_media,
    reserve_product_upload_quota,
)


async def test_reserve_product_upload_quota_uses_single_conditional_update(mock_session: AsyncMock) -> None:
    """Successful reservations should be one atomic DB update without aggregate reads."""
    user_id = uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user_id
    mock_session.execute.return_value = result

    await reserve_product_upload_quota(mock_session, parent_id=1, upload_size_bytes=128)

    mock_session.execute.assert_awaited_once()
    mock_session.get.assert_not_awaited()
    rendered_statement = str(mock_session.execute.await_args.args[0])
    assert "UPDATE" in rendered_statement
    assert "upload_file_count" in rendered_statement
    assert "upload_total_bytes" in rendered_statement
    assert "RETURNING" in rendered_statement
    # Charge targets the parent product's owner, not the requesting user.
    assert "owner_id" in rendered_statement.lower()
    assert "product" in rendered_statement.lower()


async def test_reserve_product_upload_quota_limits_follow_the_owner_role(mock_session: AsyncMock) -> None:
    """The limit must be resolved per row from the owner's role, not from one global constant.

    Asserts the compiled SQL, not the Python helper: the whole point of the CASE is
    that it lives inside the conditional UPDATE, so a refactor that read the role
    into Python first would keep the helper green while reopening the read-then-write
    race the single statement exists to close.
    """
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid4()
    mock_session.execute.return_value = result

    await reserve_product_upload_quota(mock_session, parent_id=1, upload_size_bytes=128)

    compiled = mock_session.execute.await_args.args[0].compile(compile_kwargs={"literal_binds": True})
    rendered_statement = str(compiled)
    assert "CASE" in rendered_statement.upper()
    assert "role" in rendered_statement
    for role in UserRole:
        assert f"'{role.value}'" in rendered_statement
        assert str(upload_quota_files_for_role(role)) in rendered_statement
        assert str(upload_quota_bytes_for_role(role)) in rendered_statement


async def test_reserve_product_upload_quota_raises_generic_quota_error_on_rejection(
    mock_session: AsyncMock,
) -> None:
    """A rejected conditional update should surface a generic quota error."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = result

    with pytest.raises(PayloadTooLargeError, match="Upload quota exceeded"):
        await reserve_product_upload_quota(mock_session, parent_id=1, upload_size_bytes=1)

    mock_session.execute.assert_awaited_once()
    mock_session.get.assert_not_awaited()


async def test_release_product_upload_quota_for_media_decrements_product_owned_media(mock_session: AsyncMock) -> None:
    """Deleting product media should release one file and its stored bytes without going negative."""
    item = MagicMock(parent_type=MediaParentType.PRODUCT, parent_id=1, upload_size_bytes=128)

    await release_product_upload_quota_for_media(mock_session, item)

    assert mock_session.execute.await_count == 1
    rendered_statement = str(mock_session.execute.await_args.args[0])
    assert "UPDATE" in rendered_statement
    assert "greatest" in rendered_statement.lower()
    assert "upload_file_count" in rendered_statement
    assert "upload_total_bytes" in rendered_statement
    assert "product" in rendered_statement.lower()
    mock_session.get.assert_not_awaited()


async def test_release_product_upload_quota_for_media_ignores_reference_media(mock_session: AsyncMock) -> None:
    """Reference-data media should not affect product upload quota ledgers."""
    item = MagicMock(parent_type=MediaParentType.MATERIAL, parent_id=1, upload_size_bytes=128)

    await release_product_upload_quota_for_media(mock_session, item)

    mock_session.get.assert_not_awaited()
    mock_session.execute.assert_not_awaited()


async def test_recompute_user_upload_quota_persists_product_owned_media_totals(mock_session: AsyncMock) -> None:
    """Maintenance recompute should rebuild the ledger from files plus images."""
    result = MagicMock()
    mock_session.execute.return_value = result

    await recompute_user_upload_quota(mock_session, user_id=uuid4())

    mock_session.execute.assert_awaited_once()
    rendered_statement = str(mock_session.execute.await_args.args[0])
    assert "UPDATE" in rendered_statement
    assert "UNION ALL" in rendered_statement
    assert "RETURNING" not in rendered_statement
