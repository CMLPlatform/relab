"""Unit tests for common query/loading/scoped CRUD helpers."""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from app.api.background_data.models import Material
from app.api.common.crud.exceptions import CRUDConfigurationError
from app.api.common.crud.filtering import filter_has_values
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import require_model


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

    def test_does_not_apply_noload_without_read_schema(self) -> None:
        """Loader profiles should leave statements unchanged without explicit loaders."""
        statement = select(Material)

        updated_statement = apply_loader_profile(statement, Material)

        assert str(updated_statement) == str(statement)

    def test_accepts_explicit_base_statement(self) -> None:
        """Explicit SQLAlchemy statements should remain stable through loader application."""
        statement = select(Material).where(Material.id == 1)

        updated_statement = apply_loader_profile(statement, Material)

        assert str(updated_statement) == str(statement)
