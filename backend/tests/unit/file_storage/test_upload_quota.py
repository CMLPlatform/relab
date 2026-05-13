"""Tests for Postgres-backed upload quota ledgers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.common.exceptions import PayloadTooLargeError
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.upload_quota import (
    recompute_user_upload_quota,
    release_product_upload_quota_for_media,
    reserve_product_upload_quota,
)


@pytest.fixture
def mock_session() -> AsyncMock:
    """Provide a minimal async session mock without loading global app fixtures."""
    session = AsyncMock()
    session.get = AsyncMock()
    session.execute = AsyncMock()
    return session


async def test_reserve_product_upload_quota_uses_single_conditional_update(mock_session: AsyncMock) -> None:
    """Successful reservations should be one atomic DB update without aggregate reads."""
    user_id = uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user_id
    mock_session.execute.return_value = result

    await reserve_product_upload_quota(mock_session, user_id=user_id, upload_size_bytes=128)

    mock_session.execute.assert_awaited_once()
    mock_session.get.assert_not_awaited()
    rendered_statement = str(mock_session.execute.await_args.args[0])
    assert "UPDATE" in rendered_statement
    assert "upload_file_count" in rendered_statement
    assert "upload_total_bytes" in rendered_statement
    assert "RETURNING" in rendered_statement


async def test_reserve_product_upload_quota_raises_generic_quota_error_on_rejection(
    mock_session: AsyncMock,
) -> None:
    """A rejected conditional update should surface a generic quota error."""
    user_id = uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = result

    with pytest.raises(PayloadTooLargeError, match="Upload quota exceeded"):
        await reserve_product_upload_quota(mock_session, user_id=user_id, upload_size_bytes=1)

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
