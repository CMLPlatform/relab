"""Unit tests for common query/loading/scoped CRUD helpers."""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_filter.contrib.sqlalchemy import Filter
from sqlalchemy import select

from app.api.background_data.models import Material
from app.api.common.crud.exceptions import CRUDConfigurationError, DependentModelOwnershipError
from app.api.common.crud.filtering import apply_filter, filter_has_values
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import QueryOptions, build_query, require_model
from app.api.common.crud.scopes import require_scoped_model
from app.api.file_storage.models import Video


@pytest.mark.unit
class TestFilterHasValues:
    """Tests for active fastapi-filter detection."""

    def test_returns_false_when_all_none(self) -> None:
        """Inactive filters should be skipped when every value is None."""
        mock_filter = MagicMock()
        mock_filter.__dict__ = {"name": None, "id": None}

        assert filter_has_values(mock_filter) is False

    def test_returns_true_when_value_set(self) -> None:
        """Filters with at least one concrete value should be applied."""
        mock_filter = MagicMock()
        mock_filter.__dict__ = {"name": "test", "id": None}

        assert filter_has_values(mock_filter) is True

    def test_returns_true_for_nested_filter_with_value(self) -> None:
        """Nested filters should count as active when they contain a value."""
        inner_filter = MagicMock(spec=Filter)
        inner_filter.__dict__ = {"value": "active"}
        outer_filter = MagicMock()
        outer_filter.__dict__ = {"nested": inner_filter}

        assert filter_has_values(outer_filter) is True


@pytest.mark.unit
class TestRequireModel:
    """Tests for model lookup error paths."""

    async def test_raises_crud_configuration_error_for_model_without_id(self) -> None:
        """Models without an id attribute should fail before querying."""
        session = AsyncMock()

        class NoIdModel:
            pass

        with pytest.raises(CRUDConfigurationError, match="does not have an id field"):
            await require_model(session, cast("type[Any]", NoIdModel), 1)


@pytest.mark.unit
class TestQueryConstruction:
    """Tests for query filtering and relationship loading."""

    def test_applies_sort_when_order_by_is_set(self) -> None:
        """Filter sorting should be applied only when order_by is populated."""
        mock_filter = MagicMock()
        mock_filter.order_by = "name"
        mock_filter.filter.return_value = MagicMock()
        mock_filter.sort.return_value = MagicMock()

        with patch("app.api.common.crud.filtering.apply_relationship_filter_joins", return_value=MagicMock()):
            apply_filter(select(Material), Material, mock_filter)

        mock_filter.sort.assert_called_once()

    def test_does_not_apply_noload_without_read_schema(self) -> None:
        """Loader profiles should leave statements unchanged without explicit loaders."""
        statement = select(Material)

        updated_statement = apply_loader_profile(statement, Material)

        assert str(updated_statement) == str(statement)

    def test_accepts_explicit_base_statement(self) -> None:
        """Explicit SQLAlchemy statements should not be evaluated as booleans."""
        statement = select(Material).where(Material.id == 1)

        updated_statement = build_query(Material, QueryOptions(statement=statement))

        assert str(updated_statement) == str(statement)


@pytest.mark.unit
class TestRequireScopedModel:
    """Tests for parent-scoped lookup error paths."""

    async def test_raises_crud_configuration_error_when_fk_missing(self) -> None:
        """Scoped lookups should validate the dependent foreign-key attribute."""
        session = AsyncMock()

        class ParentModel:
            id = 1
            model_label = "Parent"

        class ChildModel:
            id = 2
            model_label = "Child"

        with pytest.raises(CRUDConfigurationError, match="does not have a"):
            await require_scoped_model(
                session,
                cast("type[Any]", ParentModel),
                1,
                cast("type[Any]", ChildModel),
                2,
                "parent_id",
            )

    async def test_raises_ownership_error_when_fk_mismatch(self) -> None:
        """Scoped lookups should reject dependents owned by a different parent."""
        session = AsyncMock()
        mock_dependent = MagicMock()
        mock_dependent.product_id = 999

        with (
            patch("app.api.common.crud.scopes.require_model", return_value=mock_dependent),
            patch("app.api.common.crud.scopes.list_models", return_value=[]),
            pytest.raises(DependentModelOwnershipError, match="does not belong to"),
        ):
            await require_scoped_model(session, Material, 1, Video, 2, "product_id")
