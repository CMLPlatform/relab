"""Unit tests for common base CRUD operations."""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_filter.contrib.sqlalchemy import Filter
from sqlmodel import select

from app.api.background_data.models import Material
from app.api.common.crud.base import (
    get_model_by_id,
    get_models_query,
    get_nested_model_by_id,
    should_apply_filter,
)
from app.api.common.crud.exceptions import CRUDConfigurationError, DependentModelOwnershipError
from app.api.common.crud.utils import add_relationship_options
from app.api.data_collection.models.product import PhysicalProperties


@pytest.mark.unit
class TestShouldApplyFilter:
    """Tests for should_apply_filter."""

    def test_returns_false_when_all_none(self) -> None:
        """Test False returned when all filter values are None."""
        mock_filter = MagicMock()
        mock_filter.__dict__ = {"name": None, "id": None}

        result = should_apply_filter(mock_filter)

        assert result is False

    def test_returns_true_when_value_set(self) -> None:
        """Test True returned when any filter value is non-None."""
        mock_filter = MagicMock()
        mock_filter.__dict__ = {"name": "test", "id": None}

        result = should_apply_filter(mock_filter)

        assert result is True

    def test_returns_true_for_nested_filter_with_value(self) -> None:
        """Test True returned when a nested Filter has a non-None value."""
        inner_filter = MagicMock(spec=Filter)
        inner_filter.__dict__ = {"value": "active"}
        outer_filter = MagicMock()
        outer_filter.__dict__ = {"nested": inner_filter}

        result = should_apply_filter(outer_filter)

        assert result is True


@pytest.mark.unit
class TestGetModelByIdErrors:
    """Tests for get_model_by_id error paths."""

    async def test_raises_crud_configuration_error_for_model_without_id(self) -> None:
        """Test that CRUDConfigurationError is raised when model has no id field."""
        session = AsyncMock()

        class NoIdModel:
            pass

        with pytest.raises(CRUDConfigurationError, match="does not have an id field"):
            await get_model_by_id(session, cast("type[Any]", NoIdModel), 1)


@pytest.mark.unit
class TestGetModelsQueryOrderBy:
    """Tests for get_models_query with order_by."""

    def test_applies_sort_when_order_by_is_set(self) -> None:
        """Test that sort is called when order_by is callable on filter."""
        mock_filter = MagicMock()
        mock_filter.order_by = "name"
        mock_filter.filter.return_value = MagicMock()
        mock_filter.sort.return_value = MagicMock()

        with (
            patch("app.api.common.crud.base.add_filter_joins", return_value=MagicMock()),
            patch("app.api.common.crud.base.add_relationship_options", return_value=(MagicMock(), set())),
        ):
            get_models_query(Material, model_filter=mock_filter)

        mock_filter.sort.assert_called_once()

    def test_does_not_apply_noload_without_read_schema(self) -> None:
        """Internal CRUD fetches should keep normal ORM relationship behavior by default."""
        statement = select(Material)

        updated_statement = add_relationship_options(statement, Material)

        assert str(updated_statement) == str(statement)


@pytest.mark.unit
class TestGetNestedModelById:
    """Tests for get_nested_model_by_id error paths."""

    async def test_raises_crud_configuration_error_when_fk_missing(self) -> None:
        """Test CRUDConfigurationError when dependent model doesn't have the FK field."""
        session = AsyncMock()

        class ParentModel:
            id = 1
            model_label = "Parent"

        class ChildModel:
            id = 2
            model_label = "Child"

        with pytest.raises(CRUDConfigurationError, match="does not have a"):
            await get_nested_model_by_id(
                session,
                cast("type[Any]", ParentModel),
                1,
                cast("type[Any]", ChildModel),
                2,
                "parent_id",
            )

    async def test_raises_ownership_error_when_fk_mismatch(self) -> None:
        """Test DependentModelOwnershipError when FK doesn't match parent ID."""
        session = AsyncMock()
        mock_dependent = MagicMock()
        mock_dependent.product_id = 999  # Doesn't match parent_id=1

        with (
            patch("app.api.common.crud.base.get_model_by_id", return_value=mock_dependent),
            patch("app.api.common.crud.base.add_relationship_options", return_value=MagicMock()),
            pytest.raises(DependentModelOwnershipError, match="does not belong to"),
        ):
            await get_nested_model_by_id(session, Material, 1, PhysicalProperties, 2, "product_id")
