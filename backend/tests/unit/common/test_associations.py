"""Unit tests for association CRUD utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.background_data.models import Category, CategoryMaterialLink, Material
from app.api.common.crud.associations import (
    LinkedModelReturnType,
    add_links,
    list_linked_models,
    require_link,
    require_linked_model,
)
from app.api.common.exceptions import BadRequestError


@pytest.mark.unit
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


@pytest.mark.unit
class TestRequireLinkedModel:
    """Tests for require_linked_model."""

    async def test_returns_dependent_model_by_default(self, mock_session: AsyncMock) -> None:
        """Linked dependent lookup should return the dependent model by default."""
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.require_model", return_value=mock_dependent),
            patch("app.api.common.crud.associations.require_link", return_value=mock_link),
        ):
            result = await require_linked_model(
                mock_session,
                Material,
                1,
                Category,
                2,
                CategoryMaterialLink,
                CategoryMaterialLink.material_id,
                CategoryMaterialLink.category_id,
                return_type=LinkedModelReturnType.DEPENDENT,
            )

        assert result == mock_dependent

    async def test_returns_link_model_when_requested(self, mock_session: AsyncMock) -> None:
        """Linked dependent lookup can return the association row when requested."""
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.require_model", return_value=mock_dependent),
            patch("app.api.common.crud.associations.require_link", return_value=mock_link),
        ):
            result = await require_linked_model(
                mock_session,
                Material,
                1,
                Category,
                2,
                CategoryMaterialLink,
                CategoryMaterialLink.material_id,
                CategoryMaterialLink.category_id,
                return_type=LinkedModelReturnType.LINK,
            )

        assert result == mock_link

    async def test_raises_bad_request_error_when_link_missing(self, mock_session: AsyncMock) -> None:
        """A missing link should be reported as an unlinked dependent."""
        mock_dependent = MagicMock()

        with (
            patch("app.api.common.crud.associations.require_model", return_value=mock_dependent),
            patch("app.api.common.crud.associations.require_link", side_effect=BadRequestError("not found")),
            pytest.raises(BadRequestError, match="not linked"),
        ):
            await require_linked_model(
                mock_session,
                Material,
                1,
                Category,
                2,
                CategoryMaterialLink,
                CategoryMaterialLink.material_id,
                CategoryMaterialLink.category_id,
            )


@pytest.mark.unit
class TestListLinkedModels:
    """Tests for list_linked_models."""

    async def test_returns_linked_models(self, mock_session: AsyncMock) -> None:
        """Linked list lookup should validate the parent then delegate to list_models."""
        mock_results = [MagicMock(), MagicMock()]

        with (
            patch("app.api.common.crud.associations.require_model"),
            patch("app.api.common.crud.associations.list_models", return_value=mock_results),
        ):
            result = await list_linked_models(
                mock_session,
                Material,
                1,
                Category,
                CategoryMaterialLink,
                CategoryMaterialLink.material_id,
            )

        assert result == mock_results


@pytest.mark.unit
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

    async def test_creates_no_links_for_empty_set(self, mock_session: AsyncMock) -> None:
        """Bulk link creation should be a no-op for an empty dependent set."""
        mock_link_model = MagicMock()

        await add_links(
            mock_session,
            1,
            CategoryMaterialLink.material_id,
            set(),
            CategoryMaterialLink.category_id,
            mock_link_model,
        )

        mock_session.add_all.assert_called_once()
        assert len(mock_session.add_all.call_args[0][0]) == 0
