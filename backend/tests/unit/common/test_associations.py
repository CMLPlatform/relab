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


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add_all = MagicMock()
    return session


@pytest.mark.unit
class TestGetLinkingModelWithIdsIfItExists:
    """Tests for get_linking_model_with_ids_if_it_exists."""

    async def test_returns_link_when_found(self) -> None:
        """Test that the link is returned when found."""
        session = _make_session()
        mock_link = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_link
        session.exec = AsyncMock(return_value=mock_result)

        # Use a real SQLAlchemy model so select() works
        result = await get_linking_model_with_ids_if_it_exists(
            session, CategoryMaterialLink, 1, 2, "material_id", "category_id"
        )

        assert result == mock_link

    async def test_raises_value_error_when_not_found(self) -> None:
        """Test that ValueError is raised when link is not found."""
        session = _make_session()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        session.exec = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await get_linking_model_with_ids_if_it_exists(
                session, CategoryMaterialLink, 1, 2, "material_id", "category_id"
            )


@pytest.mark.unit
class TestGetLinkedModelById:
    """Tests for get_linked_model_by_id."""

    async def test_returns_dependent_model_by_default(self) -> None:
        """Test that the dependent model is returned with default return_type."""
        session = _make_session()
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch("app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists", return_value=mock_link),
        ):
            result = await get_linked_model_by_id(
                session,
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

    async def test_returns_link_model_when_requested(self) -> None:
        """Test that the link model is returned when return_type=LINK."""
        session = _make_session()
        mock_dependent = MagicMock()
        mock_link = MagicMock()

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch("app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists", return_value=mock_link),
        ):
            result = await get_linked_model_by_id(
                session,
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

    async def test_raises_value_error_when_link_missing(self) -> None:
        """Test that ValueError is raised with friendly message when link not found."""
        session = _make_session()
        mock_dependent = MagicMock()

        parent_model = MagicMock()
        parent_model.get_api_model_name.return_value = MagicMock(name_capital="Parent")
        dependent_model = MagicMock()
        dependent_model.get_api_model_name.return_value = MagicMock(name_capital="Child")

        with (
            patch("app.api.common.crud.associations.get_model_by_id", return_value=mock_dependent),
            patch(
                "app.api.common.crud.associations.get_linking_model_with_ids_if_it_exists",
                side_effect=ValueError("not found"),
            ),
            pytest.raises(ValueError, match="not linked"),
        ):
            await get_linked_model_by_id(
                session,
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

    async def test_returns_linked_models(self) -> None:
        """Test that linked models are returned for a parent."""
        session = _make_session()
        mock_results = [MagicMock(), MagicMock()]

        with (
            patch("app.api.common.crud.associations.get_model_by_id"),
            patch("app.api.common.crud.associations.get_models", return_value=mock_results),
        ):
            result = await get_linked_models(
                session,
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

    async def test_creates_links_for_all_ids(self) -> None:
        """Test that links are created for all IDs in the set."""
        session = _make_session()

        await create_model_links(session, 1, "parent_id", {10, 20, 30}, "child_id", MagicMock)

        session.add_all.assert_called_once()
        added_links = session.add_all.call_args[0][0]
        assert len(added_links) == 3

    async def test_creates_no_links_for_empty_set(self) -> None:
        """Test that add_all is called with empty list for empty id set."""
        session = _make_session()
        mock_link_model = MagicMock()

        await create_model_links(session, 1, "parent_id", set(), "child_id", mock_link_model)

        session.add_all.assert_called_once()
        added_links = session.add_all.call_args[0][0]
        assert len(added_links) == 0
