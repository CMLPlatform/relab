"""Unit tests for association CRUD utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.common.crud.associations import add_links, require_link
from app.api.common.exceptions import BadRequestError
from app.api.reference_data.models import CategoryMaterialLink


class TestRequireLink:
    """Tests for require_link."""

    async def test_returns_link_when_found(self, mock_session: AsyncMock) -> None:
        """Existing association rows should be returned."""
        mock_link = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_link
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await require_link(
            mock_session,
            CategoryMaterialLink,
            1,
            2,
            CategoryMaterialLink.material_id,
            CategoryMaterialLink.category_id,
        )

        assert result == mock_link

    async def test_raises_bad_request_error_when_not_found(self, mock_session: AsyncMock) -> None:
        """Missing association rows should raise a client-safe error."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="not found"):
            await require_link(
                mock_session,
                CategoryMaterialLink,
                1,
                2,
                CategoryMaterialLink.material_id,
                CategoryMaterialLink.category_id,
            )


class TestAddLinks:
    """Tests for add_links."""

    async def test_creates_links_for_all_ids(self, mock_session: AsyncMock) -> None:
        """Bulk link creation should create one association row per dependent ID."""
        await add_links(
            mock_session,
            1,
            CategoryMaterialLink.material_id,
            {10, 20, 30},
            CategoryMaterialLink.category_id,
            MagicMock,
        )

        mock_session.add_all.assert_called_once()
        assert len(mock_session.add_all.call_args[0][0]) == 3
