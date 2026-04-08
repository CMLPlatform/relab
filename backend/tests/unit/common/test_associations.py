"""Unit tests for association CRUD utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.background_data.models import Category, CategoryMaterialLink, Material
from app.api.common.crud.associations import (
    LinkedModelReturnType,
    create_model_links,
    get_linked_model_by_id,
    get_linked_models,
    get_linking_model_with_ids_if_it_exists,
)
from app.api.common.exceptions import BadRequestError


@pytest.mark.unit
class TestGetLinkingModelWithIdsIfItExists:
    """Tests for get_linking_model_with_ids_if_it_exists."""

    async def test_returns_link_when_found(self, mock_session: AsyncMock) -> None:
        """Test that the link is returned when found."""
        mock_link = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_link
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await get_linking_model_with_ids_if_it_exists(
            mock_session, CategoryMaterialLink, 1, 2, "material_id", "category_id"
        )

        assert result == mock_link

    async def test_raises_bad_request_error_when_not_found(self, mock_session: AsyncMock) -> None:
        """Test that BadRequestError is raised when link is not found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(BadRequestError, match="not found"):
            await get_linking_model_with_ids_if_it_exists(
                mock_session, CategoryMaterialLink, 1, 2, "material_id", "category_id"
            )


@pytest.mark.unit
class TestGetLinkedModelById:
    """Tests for get_linked_model_by_id."""

    async def test_returns_dependent_model_by_default(self, mock_session: AsyncMock) -> None:
        """Test that the dependent model is returned with default return_type."""
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch("app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists", return_value=mock_link),
        ):
            result = await get_linked_model_by_id(
                mock_session,
                MagicMock(),
                1,
                MagicMock(),
                2,
                MagicMock(),
                "parent_id",
                "child_id",
                return_type=LinkedModelReturnType.DEPENDENT,
            )

        assert result == mock_dependent

    async def test_returns_link_model_when_requested(self, mock_session: AsyncMock) -> None:
        """Test that the link model is returned when return_type=LINK."""
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch("app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists", return_value=mock_link),
        ):
            result = await get_linked_model_by_id(
                mock_session,
                MagicMock(),
                1,
                MagicMock(),
                2,
                MagicMock(),
                "parent_id",
                "child_id",
                return_type=LinkedModelReturnType.LINK,
            )

        assert result == mock_link

    async def test_raises_bad_request_error_when_link_missing(self, mock_session: AsyncMock) -> None:
        """Test that BadRequestError is raised with friendly message when link not found."""
        mock_dependent = MagicMock()

        parent_model = MagicMock()
        parent_model.model_label = "Parent"
        dependent_model = MagicMock()
        dependent_model.model_label = "Child"

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch(
                "app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists",
                side_effect=BadRequestError("not found"),
            ),
            pytest.raises(BadRequestError, match="not linked"),
        ):
            await get_linked_model_by_id(
                mock_session,
                parent_model,
                1,
                dependent_model,
                2,
                MagicMock(),
                "parent_id",
                "child_id",
            )


@pytest.mark.unit
class TestGetLinkedModels:
    """Tests for get_linked_models."""

    async def test_returns_linked_models(self, mock_session: AsyncMock) -> None:
        """Test that linked models are returned for a parent."""
        mock_results = [MagicMock(), MagicMock()]

        with (
            patch("app.api.common.crud.associations.get_model_by_id"),
            patch("app.api.common.crud.associations.get_models", return_value=mock_results),
        ):
            result = await get_linked_models(
                mock_session,
                Material,
                1,
                Category,
                CategoryMaterialLink,
                "material_id",
            )

        assert result == mock_results


@pytest.mark.unit
class TestCreateModelLinks:
    """Tests for create_model_links."""

    async def test_creates_links_for_all_ids(self, mock_session: AsyncMock) -> None:
        """Test that links are created for all IDs in the set."""
        await create_model_links(mock_session, 1, "parent_id", {10, 20, 30}, "child_id", MagicMock)

        mock_session.add_all.assert_called_once()
        added_links = mock_session.add_all.call_args[0][0]
        assert len(added_links) == 3

    async def test_creates_no_links_for_empty_set(self, mock_session: AsyncMock) -> None:
        """Test that add_all is called with empty list for empty id set."""
        mock_link_model = MagicMock()

        await create_model_links(mock_session, 1, "parent_id", set(), "child_id", mock_link_model)

        mock_session.add_all.assert_called_once()
        added_links = mock_session.add_all.call_args[0][0]
        assert len(added_links) == 0
